import { createNearbyRefreshGate } from "./nearby-refresh.mjs";
import { createTripStorage } from "./trip-storage.mjs";
import { toNativeGpsSummary } from "./timeline-gps-read.mjs";
import { createTripOdometerSync } from "./odometer-sync.mjs";
import {
  isNative,
  mergeTripPoints,
  nativeDistance,
  readStoppedTrip,
} from "./native-trip.mjs";

const activeKey = (uid) => `active:${uid}`;
const historyKey = (uid) => `trips:${uid}`;
const intentKey = (uid) => `native-stop-intent:${uid}`;
const mergeKey = (uid, tripId) => `native-merged:${uid}:${tripId}`;
const now = () => new Date().toISOString();
const isStorageQuota = (error) =>
  error?.name === "QuotaExceededError" ||
  /exceeded the quota|quota exceeded|storage quota/i.test(String(error?.message || ""));


export function createUseRide({
  React,
  client,
  read,
  write,
  request,
  displayName,
  appendPoint,
  distanceKm,
}) {
  const storage = createTripStorage({
    read,
    write,
    isOnline: () => navigator.onLine !== false,
    upload: (record) =>
      request(client.from("trips").upsert(record, { onConflict: "id" })),
  });

  const odometerSync=createTripOdometerSync({
    read,write,isOnline:()=>navigator.onLine!==false,
    apply:row=>request(client.rpc("apply_rider_trip_odometer",{
      p_trip_id:row.id,p_distance_km:row.distance_km,p_ended_at:row.ended_at
    }))
  });
  return function useRide(user, notify, view) {
    const uid = user?.id || "guest";
    const [position, setPosition] = React.useState(null);
    const [sharing, setSharing] = React.useState(false);
    const [riders, setRiders] = React.useState([]);
    const [trip, setTrip] = React.useState(null);
    const [history, setHistory] = React.useState([]);
    const [paused, setPaused] = React.useState(false);
    const [focus, setFocus] = React.useState(0);
    const [busy, setBusy] = React.useState(false);
    const [gpsStatus, setGpsStatus] = React.useState("checking");
    const [gpsProblem, setGpsProblem] = React.useState("");
    const account = React.useRef(uid);
    const active = React.useRef(null);
    const isPaused = React.useRef(false);
    const isSharing = React.useRef(false);
    const lastPosition = React.useRef(null);
    const lastShare = React.useRef(0);
    const shareGeneration = React.useRef(0);
    const nearbyRefresh = React.useRef(null);
    if (!nearbyRefresh.current) nearbyRefresh.current = createNearbyRefreshGate();
    const nextBreak = React.useRef(false);
    const stopping = React.useRef(null);
    const lastEvents = React.useRef(null);
    account.current = uid;
    const sameAccount = () => account.current === uid;

    function saveActive(record) {
      // Android SQLite owns the complete active GPS track. Do not duplicate
      // thousands of location points into quota-limited WebView localStorage.
      // Keep full points in React memory for maps; on reload native polling
      // rehydrates the track. Non-native sessions retain their original data.
      const persisted = record && isNative()
        ? { ...record, points: [] }
        : record;
      write(activeKey(uid), persisted);
      active.current = record;
      lastEvents.current = record?.events;
      setTrip(record);
    }
    function gpsReady(point) {
      setGpsStatus("ready");
      setGpsProblem("");
      setPosition(point);
      lastPosition.current = point;
    }
    function gpsError(error) {
      const message =
        error.code === 1
          ? "앱의 위치 권한을 허용해 주세요"
          : error.code === 2
            ? "위치를 확인할 수 없어요. 휴대폰 위치 서비스를 켜 주세요"
            : "GPS 응답이 늦어요. 다시 시도해 주세요";
      setGpsStatus("error");
      setGpsProblem(message);
      return message;
    }

    async function flushOdometer(){
      if(uid==="guest")return;
      try{
        const count=await odometerSync.flush(uid,sameAccount);
        if(count && sameAccount())window.dispatchEvent(new Event("riderspot:odometer-updated"));
      }catch(error){console.warn("계기판 주행거리 반영 대기",error.message);}
    }
    async function flush() {
      if (uid === "guest") return;
      for (const id of storage.pending(uid)) {
        if (!sameAccount()) return;
        // A stop intent takes priority over a queued snapshot from a previous release.
        if (read(intentKey(uid), null)?.tripId === id) continue;
        try {
          await storage.sync(uid, id, sameAccount);
        } catch (error) {
          console.warn("운행 기록 서버 저장 대기", error.message);
        }
      }
      await flushOdometer();
    }

    React.useEffect(() => {
      let listening = true;
      const current = () => listening && sameAccount();
      const local = storage.getHistory(uid);
      setHistory(local);
      let restored = read(activeKey(uid), null);
      if (
        restored?.id &&
        local.some((record) => record.id === restored.id && record.ended_at)
      ) {
        // Completion was committed before a process exit interrupted active-state cleanup.
        restored = null;
      }
      active.current = restored;
      lastEvents.current = restored?.events;
      setTrip(restored);
      isPaused.current = Boolean(restored);
      nextBreak.current = Boolean(restored);
      setPaused(Boolean(restored));
      if (user)
        request(
          client
            .from("trips")
            .select("*")
            .order("started_at", { ascending: false })
            .limit(50),
        )
          .then((server) => {
            if (!current()) return;
            const merged = storage.mergeHistory(uid, server);
            try {
              write(historyKey(uid), merged);
            } catch (error) {
              // A full WebView localStorage must not hide valid remote records.
              if (!isStorageQuota(error)) throw error;
              console.warn("운행 이력 로컬 캐시 용량 초과: 서버 기록을 표시합니다.");
            }
            setHistory(merged);
          })
          .catch(() => {
            if (current()) notify("기기에 저장된 운행을 표시합니다.");
          });

      let resuming = false;
      async function resume() {
        if (!current() || resuming) return;
        resuming = true;
        try {
          if (isNative()) await recoverFinished();
          if (current()) await flush();
        } catch (error) {
          if (current()) console.warn("운행 복구 대기", error.message);
        } finally {
          resuming = false;
        }
      }
      const visible = () => {
        if (!document.hidden) void resume();
      };
      const timer = setInterval(() => {
        if (!document.hidden) void flush();
      }, 45000);
      const initial = setTimeout(resume, 0);
      window.addEventListener("online", resume);
      window.addEventListener("focus", resume);
      window.addEventListener("riderspot:odometer-retry", resume);
      document.addEventListener("visibilitychange", visible);
      return () => {
        listening = false;
        clearInterval(timer);
        clearTimeout(initial);
        window.removeEventListener("online", resume);
        window.removeEventListener("riderspot:odometer-retry", resume);
        window.removeEventListener("focus", resume);
        document.removeEventListener("visibilitychange", visible);
        shareGeneration.current++;
        isSharing.current = false;
        setSharing(false);
        setRiders([]);
      };
    }, [uid]);

    React.useEffect(() => {
      const receive = ({ detail }) => {
        const record = active.current;
        if (
          !record?.id ||
          isPaused.current ||
          stopping.current ||
          detail?.tripId !== record.id ||
          !detail.points?.length
        )
          return;
        const points = mergeTripPoints(record.points, detail.points);
        try {
          saveActive({
            ...record,
            points,
            distance_km: nativeDistance(points),
          });
        } catch (error) {
          console.warn("SQLite GPS 미리 보기 저장 대기", error.message);
        }
        const latest = points.at(-1);
        if (latest && Date.now() - latest.t < 60000) gpsReady(latest);
      };
      const refresh = () => {
        const record = read(activeKey(uid), null);
        if (
          record?.id &&
          record.id === active.current?.id &&
          JSON.stringify(record.events) !== JSON.stringify(lastEvents.current)
        ) {
          const updated = { ...active.current, events: record.events };
          active.current = updated;
          lastEvents.current = updated.events;
          setTrip(updated);
        }
      };
      window.addEventListener("riderspot:native-sqlite-points", receive);
      window.addEventListener("riderspot:native-events", refresh);
      return () => {
        window.removeEventListener("riderspot:native-sqlite-points", receive);
        window.removeEventListener("riderspot:native-events", refresh);
      };
    }, [uid]);

    async function sharePosition(point) {
      if (!isSharing.current || !user || Date.now() - lastShare.current < 10000)
        return;
      lastShare.current = Date.now();
      const generation = shareGeneration.current;
      try {
        await request(
          client.rpc("share_location", {
            p_lat: point.lat,
            p_lng: point.lng,
            p_nickname: displayName(user),
          }),
        );
        if (generation !== shareGeneration.current) {
          if (sameAccount()) await client.rpc("stop_sharing");
          return;
        }
        await refreshRiders();
      } catch {
        notify("위치 전송이 지연되고 있어요. 연결을 확인해 주세요.");
      }
    }
    async function refreshRiders() {
      if (!isSharing.current) return;
      const generation = shareGeneration.current;
      return nearbyRefresh.current(generation, async () => {
        const list = await request(client.rpc("rs_nearby_riders"));
        if (generation === shareGeneration.current && isSharing.current && sameAccount())
          setRiders(list);
      });
    }
    function fromGeo({ coords, timestamp }) {
      return {
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: coords.accuracy,
        heading: coords.heading,
        t: timestamp,
      };
    }
    React.useEffect(() => {
      if ((view !== "nearby" && !sharing && !trip) || !navigator.geolocation)
        return;
      const id = navigator.geolocation.watchPosition(
        (fix) => {
          const point = fromGeo(fix);
          gpsReady(point);
          if (isSharing.current) void sharePosition(point);
          const record = active.current;
          if (isNative() || !record || isPaused.current || stopping.current)
            return;
          const points = appendPoint(record.points, {
            ...point,
            break: nextBreak.current,
          });
          if (points.length > record.points.length) nextBreak.current = false;
          saveActive({ ...record, points, distance_km: distanceKm(points) });
        },
        (error) => notify(gpsError(error)),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
      );
      return () => navigator.geolocation.clearWatch(id);
    }, [sharing, Boolean(trip), uid, view]);
    React.useEffect(() => {
      if (!sharing || !user) return;
      const refresh = () => refreshRiders().catch(() => {});
      const timer = setInterval(() => {
        setRiders((rows) =>
          rows.filter((row) => Date.now() - Date.parse(row.updated_at) < 60000),
        );
        if (lastPosition.current && Date.now() - lastPosition.current.t < 30000)
          void sharePosition(lastPosition.current);
        void refresh();
      }, 10000);
      const hidden = () => {
        if (document.hidden) void stopSharing();
      };
      document.addEventListener("visibilitychange", hidden);
      return () => {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", hidden);
      };
    }, [sharing, uid]);

    async function getLocation(recenter) {
      if (!navigator.geolocation)
        throw Error("위치 기능을 지원하지 않는 브라우저예요.");
      const fix = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(
          resolve,
          (error) => reject(Error(gpsError(error))),
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
        ),
      );
      const point = fromGeo(fix);
      gpsReady(point);
      if (recenter) setFocus((value) => value + 1);
      return point;
    }
    async function locate() {
      const fix = lastPosition.current;
      if (fix && Date.now() - fix.t < 30000) {
        setFocus((value) => value + 1);
        return fix;
      }
      return getLocation(true);
    }
    async function startSharing() {
      if (!user) return;
      setBusy(true);
      try {
        const point = await getLocation(false);
        if (document.hidden || !sameAccount()) return;
        isSharing.current = true;
        shareGeneration.current++;
        lastShare.current = 0;
        await request(
          client.rpc("share_location", {
            p_lat: point.lat,
            p_lng: point.lng,
            p_nickname: displayName(user),
          }),
        );
        if (document.hidden || !sameAccount()) {
          await stopSharing();
          return;
        }
        lastShare.current = Date.now();
        setSharing(true);
        await refreshRiders();
        notify("위치 공유를 시작했어요.");
      } catch (error) {
        await stopSharing();
        notify(error.message);
      } finally {
        setBusy(false);
      }
    }
    async function stopSharing() {
      isSharing.current = false;
      shareGeneration.current++;
      setSharing(false);
      setRiders([]);
      if (!user) return;
      const { error } = await client.rpc("stop_sharing");
      if (error)
        notify(
          "연결이 끊겨 종료를 전송하지 못했어요. 마지막 위치는 60초 이내 숨겨집니다.",
        );
    }
    async function startTrip() {
      if (
        active.current ||
        stopping.current ||
        (await window.__rsGPS42PreflightStart?.())
      )
        return;
      setBusy(true);
      try {
        const point = await getLocation(false);
        if (!sameAccount() || active.current) return;
        const started_at = now();
        saveActive({
          id: crypto.randomUUID(),
          user_id: user?.id,
          started_at,
          ended_at: null,
          points: isNative() ? [] : [point],
          events: [{ type: "운행 시작", at: started_at }],
          distance_km: 0,
        });
        isPaused.current = false;
        setPaused(false);
        notify("운행 기록을 시작했어요. 위치 공유는 별도예요.");
      } catch (error) {
        notify(error.message);
      } finally {
        setBusy(false);
      }
    }
    function togglePause() {
      const record = active.current;
      if (!record || stopping.current) return;
      const pause = !isPaused.current;
      saveActive({
        ...record,
        events: [
          ...(record.events || []),
          { type: pause ? "휴식 시작" : "운행 재개", at: now() },
        ],
      });
      isPaused.current = pause;
      setPaused(pause);
      if (!pause) nextBreak.current = true;
    }

    function complete(record, intent, alreadyComplete = false) {
      if (stopping.current) return stopping.current;
      const task = (async () => {
        const bridge = window.__rsGPS42NativeRead;
        if (isNative() && !bridge)
          throw Error("기기 GPS 연결 확인 중이에요. 다시 눌러 주세요.");
        if (bridge) write(intentKey(uid), intent);
        const finished = bridge
          ? await readStoppedTrip(
              { ...bridge, detectStops: window.__rsNativeDetectStops },
              record,
              intent.time,
            )
          : {
              ...record,
              ended_at: intent.time,
              events: [
                ...(record.events || []),
                { type: "운행 종료", at: intent.time },
              ],
            };
        if (!sameAccount())
          throw Error("운행을 기록한 계정에서 다시 열어 주세요.");
        let updated;
        let remotelySavedAfterQuota = false;
        try {
          // The complete GPS session remains in the on-device native SQLite.
          // Persist only the date/sequence index in WebView storage; it can be
          // queried lazily by Timeline without duplicating a full-year route.
          updated = storage.commit(uid, bridge ? toNativeGpsSummary(finished) : finished);
        } catch (error) {
          if (!isStorageQuota(error)) throw error;
          // Never delete or truncate old unsynced trips to free storage.
          // The native SQLite recorder has already stopped and retains GPS samples.
          if (uid === "guest") {
            throw Error("저장공간이 가득 찼어요. GPS 원본은 기기에 보관 중입니다. 로그인 후 다시 종료해 주세요.");
          }
          const { id, started_at, ended_at, distance_km, points, events, memo } = finished;
          try {
            await request(client.from("trips").upsert(
              { id, user_id: uid, started_at, ended_at, distance_km, points, events, memo },
              { onConflict: "id" },
            ));
          } catch (uploadError) {
            console.warn("운행 종료 서버 직접 저장 대기", uploadError?.message);
            throw Error("로컬 저장공간이 가득 찼고 서버 저장도 실패했어요. GPS 원본은 기기에 남아 있습니다. 인터넷 연결 후 다시 종료해 주세요.");
          }
          remotelySavedAfterQuota = true;
          // Keep the full record in memory for this session. Earlier trips and
          // their local backup stay untouched; the server rehydrates on relaunch.
          updated = [
            finished,
            ...storage.getHistory(uid).filter((row) => row.id !== finished.id),
          ];
        }
        if (remotelySavedAfterQuota) {
          if (!alreadyComplete || read(activeKey(uid), null)?.id === finished.id)
            saveActive(null);
          if (bridge) {
            write(mergeKey(uid, finished.id), true);
            write(intentKey(uid), null);
          }
          setHistory(updated);
          isPaused.current = false;
          setPaused(false);
          try { odometerSync.enqueue(uid, finished); }
          catch (error) { console.warn("주행거리 동기화 대기", error?.message); }
          notify("저장공간 초과로 기기 저장 대신 서버에 운행을 안전하게 저장했어요.");
          void flush();
          return finished;
        }
        storage.enqueue(uid, finished.id);
        odometerSync.enqueue(uid,finished);
        if (!alreadyComplete || read(activeKey(uid), null)?.id === finished.id)
          saveActive(null);
        if (bridge) {
          write(mergeKey(uid, finished.id), true);
          write(intentKey(uid), null);
        }
        setHistory(updated);
        isPaused.current = false;
        setPaused(false);
        notify(
          uid === "guest"
            ? "운행을 이 기기에 저장했어요."
            : "기기에 저장했어요. 연결되면 서버에 동기화합니다.",
        );
        void flush();
        return finished;
      })();
      stopping.current = task;
      return task.finally(() => {
        stopping.current = null;
      });
    }
    function finish() {
      if (!active.current) return stopping.current;
      const record = active.current;
      const previous = read(intentKey(uid), null);
      return complete(
        record,
        previous?.tripId === record.id
          ? previous
          : { tripId: record.id, time: now() },
      );
    }
    async function recoverFinished() {
      const bridge = window.__rsGPS42NativeRead;
      if (!bridge || stopping.current) return;
      const state = await bridge.call("state");
      if (!sameAccount()) return;
      const intent = read(intentKey(uid), null);
      if (intent?.tripId && active.current?.id === intent.tripId) {
        await finish();
        return;
      }
      if (state.activeId || !state.lastStoppedId) return;
      const id = state.lastStoppedId;
      if (active.current?.id === id) {
        await finish();
        return;
      }
      if (read(mergeKey(uid, id), false)) return;
      let legacyHistory;
      try {
        legacyHistory = JSON.parse(
          localStorage.getItem(historyKey(uid)) || "null",
        );
      } catch {
        legacyHistory = null;
      }
      const known =
        storage.getHistory(uid).find((row) => row.id === id && row.ended_at) ||
        (Array.isArray(legacyHistory) &&
          legacyHistory.find((row) => row?.id === id && row.ended_at));
      if (known && (!known.user_id || known.user_id === uid))
        await complete(known, { tripId: id, time: known.ended_at }, true);
    }
    function restoreActive(record) {
      if (
        !sameAccount() ||
        !record?.id ||
        record.ended_at ||
        (record.user_id && record.user_id !== uid)
      )
        return false;
      // Android keeps lastStoppedId after completion. An old native bridge can
      // retry its legacy unprefixed active record every three seconds. Never
      // resurrect a trip that was already committed as finished.
      const completed = read(mergeKey(uid, record.id), false) ||
        storage.getHistory(uid).some(row => row?.id === record.id && row.ended_at) ||
        (() => {
          try {
            const rows = JSON.parse(localStorage.getItem(historyKey(uid)) || "[]");
            return Array.isArray(rows) &&
              rows.some(row => row?.id === record.id && row.ended_at);
          } catch { return false; }
        })();
      if (completed || stopping.current || (active.current && active.current.id !== record.id))
        return false;
      if (active.current?.id === record.id) return false;
      saveActive(record);
      isPaused.current = false;
      setPaused(false);
      return true;
    }
    async function sync(record) {
      if (uid === "guest") {
        notify("로그인 후 서버에 보관할 수 있어요.");
        return;
      }
      if (!record?.ended_at) return;
      storage.enqueue(uid, record.id);
      if (await storage.sync(uid, record.id, sameAccount))
        notify("서버에 안전하게 보관했어요.");
    }
    async function saveMemo(id, memo) {
      const record = storage.getHistory(uid).find((row) => row.id === id);
      if (!record) return;
      const updated = { ...record, memo: memo || null };
      setHistory(storage.commit(uid, updated));
      try {
        await sync(updated);
      } catch {
        notify("메모를 기기에 저장했어요. 연결되면 자동으로 동기화해요.");
      }
    }
    async function remove(id) {
      if (user) await request(client.from("trips").delete().eq("id", id));
      const updated = storage
        .getHistory(uid)
        .filter((record) => record.id !== id);
      write(historyKey(uid), updated);
      setHistory(updated);
    }
    const api = {
      position,
      gpsStatus,
      gpsProblem,
      sharing,
      riders,
      trip,
      history,
      paused,
      focus,
      busy,
      saveMemo,
      locate,
      startSharing,
      stopSharing,
      startTrip,
      togglePause,
      restoreActive,
      sync,
      remove,
    };
    // APK 1.0.6 assigns its wrapper to this property. Keep one finalizer while retaining the legacy start/pause and OAuth hooks.
    Object.defineProperty(api, "finish", {
      enumerable: true,
      get: () => finish,
      set: () => {},
    });
    return api;
  };
}
