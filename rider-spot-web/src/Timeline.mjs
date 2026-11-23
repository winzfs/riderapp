import { createUI } from "./ui.mjs";
import { createRideRecap } from "./ride-recap.mjs";
import {
  rs33Zone,
  rs33ISO,
  rs33WorkDay,
  rs33Time,
  rs33Format,
  rs33DateAdd,
  rs33WeekStart,
  rs33Duration,
} from "./timeline-dates.mjs";
import { rs33Timestamp, analyzeMatchedCourse } from "./route-analysis.mjs";
import { useRouteAnalysis } from "./use-route-analysis.mjs";
import { buildDailyTimeline } from "./daily-timeline.mjs";
import { calendarDaysForTrip, loadCalendarGps, loadDetailGps, overlapsKstDay } from "./timeline-gps-read.mjs";
import { useRoutePlayback } from "./route-playback.mjs";
import { createGamificationUI } from "./gamification-ui.mjs";
import { timelineStartPoint, timelineEndPoint, timelineLivePosition, isTimelineCoordinate } from "./timeline-location.mjs";

export function createTimeline(S, Zo, Income, client) {
  const rs33J = S.createElement;
  const RideRecap = createRideRecap(S, client);
  const { Icon, Metrics } = createUI(S);
  const { DayRideCard } = createGamificationUI(S);
  const EMPTY = [];
  const thumbnailCache = new WeakMap();
  function rs33Thumb(trip) {
    const source = Array.isArray(trip.points) ? trip.points : EMPTY;
    if (thumbnailCache.has(source)) return thumbnailCache.get(source);
    const groups = [];
    let line = [];
    let previous = null;
    const step = Math.max(1, Math.ceil(source.length / 96));
    for (
      let i = 0;
      i < source.length;
      i = Math.min(i + step, source.length - 1)
    ) {
      const point = source[i];
      if (
        point?.break ||
        !Number.isFinite(point?.lat) ||
        !Number.isFinite(point?.lng) ||
        (previous &&
          Number(point.t) - Number(previous.t) > Math.max(30000, step * 2000))
      ) {
        if (line.length > 1) groups.push(line);
        line = [];
      }
      if (Number.isFinite(point?.lat) && Number.isFinite(point?.lng))
        line.push(point);
      previous = point;
      if (i === source.length - 1) break;
    }
    if (line.length > 1) groups.push(line);
    const points = groups.flat();
    if (!points.length)
      return rs33J(
        "span",
        { className: "rs33-thumb rs33-thumb-empty" },
        "경로 없음",
      );
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (const p of points) {
      x0 = Math.min(x0, p.lng);
      x1 = Math.max(x1, p.lng);
      y0 = Math.min(y0, p.lat);
      y1 = Math.max(y1, p.lat);
    }
    const lonScale = Math.cos(((y1 + y0) * Math.PI) / 360);
    const scale = Math.min(
      80 / Math.max((x1 - x0) * lonScale, 1e-9),
      49 / Math.max(y1 - y0, 1e-9),
    );
    const shapes = groups.map((path, i) =>
      rs33J("polyline", {
        key: i,
        points: path
          .map((p) =>
            [
              (51 + (p.lng - (x0 + x1) / 2) * lonScale * scale).toFixed(1),
              (33 - (p.lat - (y0 + y1) / 2) * scale).toFixed(1),
            ].join(","),
          )
          .join(" "),
        fill: "none",
        stroke: "#08775d",
        strokeWidth: 3,
        strokeLinejoin: "round",
        strokeLinecap: "round",
      }),
    );
    const thumbnail = rs33J(
      "svg",
      { viewBox: "0 0 102 66", className: "rs33-thumb", "aria-hidden": true },
      shapes,
    );
    thumbnailCache.set(source, thumbnail);
    return thumbnail;
  }
  function formatPlaybackClock(ms) {
    const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return (
      (hours ? hours + ":" : "") +
      String(minutes).padStart(2, "0") +
      ":" +
      String(seconds).padStart(2, "0")
    );
  }
  function playbackBar(player, label, fit) {
    if (!player?.track || player.track.samples < 2 || player.duration < 1)
      return null;
    const complete = player.elapsed >= player.duration;
    return rs33J(
      "section",
      { className: "rs59-player", "aria-label": label + " 재생" },
      rs33J(
        "div",
        { className: "rs59-player-top" },
        rs33J(
          "button",
          {
            type: "button",
            className: "rs59-play",
            "aria-label": player.playing
              ? "경로 재생 일시정지"
              : complete
                ? "경로 처음부터 다시 재생"
                : "경로 재생 시작",
            "aria-pressed": player.playing,
            onClick: player.toggle,
          },
          rs33J(Icon, {
            name: player.playing ? "pause" : complete ? "reset" : "play",
            size: 17,
          }),
          player.playing ? "일시정지" : complete ? "다시 재생" : "경로 재생",
        ),
        rs33J(
          "label",
          { className: "rs59-speed" },
          rs33J("span", null, "속도"),
          rs33J(
            "select",
            {
              "aria-label": "경로 재생 배속",
              value: player.speed,
              onChange: (event) => player.setSpeed(event.target.value),
            },
            ...[10, 20, 30, 60, 100].map((speed) =>
              rs33J("option", { key: speed, value: speed }, speed + "배"),
            ),
          ),
        ),
        rs33J(
              "button",
              {
                type: "button",
                className: "rs59-reset",
                onClick: () => { player.reset(); fit(); },
                "aria-label": player.showing ? "경로 재생 종료하고 전체 경로 보기" : "전체 경로 맞춤",
              },
              "전체 경로",
            ),
      ),
      rs33J("input", {
        className: "rs59-seek",
        type: "range",
        min: 0,
        max: Math.max(1, Math.round(player.duration)),
        step: 1000,
        value: Math.min(
          Math.round(player.elapsed),
          Math.round(player.duration),
        ),
        "aria-label": "경로 재생 위치",
        "aria-valuetext":
          formatPlaybackClock(player.elapsed) +
          " / " +
          formatPlaybackClock(player.duration),
        onChange: (event) => player.seek(event.target.value),
      }),
      rs33J(
        "div",
        { className: "rs59-time-row" },
        rs33J(
          "span",
          null,
          player.showing && player.displayTime
            ? "기록 시각 " + rs33Time(player.displayTime)
            : "",
        ),
        rs33J(
          "span",
          { className: "rs59-elapsed" },
          formatPlaybackClock(player.elapsed) +
            " / " +
            formatPlaybackClock(player.duration),
        ),
      ),
    );
  }
  function ss({ ride, notify, user, login }) {
    const [today, setToday] = S.useState(() => rs33WorkDay(Date.now()));
    S.useEffect(() => {
      const refresh = () => setToday(rs33WorkDay(Date.now()));
      const timer = setInterval(refresh, 60_000);
      document.addEventListener("visibilitychange", refresh);
      return () => {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", refresh);
      };
    }, []);
    const [selected, setSelected] = S.useState(null);
    const [recapDay, setRecapDay] = S.useState(null);
    const liveDay = ride.trip ? today : today;
    const [day, setDay] = S.useState(today);
    const gpsDayClick = S.useRef({day:today,at:null,logged:false});
    // Calendar rolls to the new day while the original native GPS track
    // remains continuous; never call stop/start at midnight.
    S.useEffect(()=>{
      if(ride.trip && !ride.trip.ended_at)setDay(today);
    },[today,ride.trip?.id]);
    const [week, setWeek] = S.useState(rs33WeekStart(today));
    const [expanded, setExpanded] = S.useState(false);
    const [focused, setFocused] = S.useState(null);
    const [reset, setReset] = S.useState(0);
    const [memo, setMemo] = S.useState("");
    const [memoBusy, setMemoBusy] = S.useState(false);
    const [finished, setFinished] = S.useState(false);
    // A finish initiated on the map uses the same persisted trip and detail page.
    S.useEffect(() => {
      const id = window.__rsMapFinishedTrip;
      if (!id || !ride.history?.some(row => row.id === id && row.ended_at)) return;
      window.__rsMapFinishedTrip = null;
      setSelected(id);
      setFinished(true);
    }, [ride.history]);
    const [allDays, setAllDays] = S.useState(false);
    const [ridesOpen, setRidesOpen] = S.useState(true);
    const [following, setFollowing] = S.useState(false);
    const onUnfollow = S.useCallback(() => setFollowing(false), []);
    const [eventOpen, setEventOpen] = S.useState(() => {
      try {
        return localStorage.getItem("rs:trip-events-open") === "1";
      } catch {
        return false;
      }
    });
    const [showStamps, setShowStamps] = S.useState(() => {
      try {
        return localStorage.getItem("rs:route-time-stamps") !== "0";
      } catch {
        return true;
      }
    });
    const [showEvents, setShowEvents] = S.useState(() => {
      try { return localStorage.getItem("rs:route-stop-events") === "1"; }
      catch { return false; }
    });
    const [roadPreview, setRoadPreview] = S.useState(null);
    const [roadBusy, setRoadBusy] = S.useState(false);
    const [roadNotice, setRoadNotice] = S.useState("");
    // GPS samples are not part of the calendar model. Only day-overlapping
    // trips are requested from SQLite; quick date changes cancel stale results.
    const gpsCache = S.useRef(new Map());
    const [dayGps, setDayGps] = S.useState({ day: null, source: null, records: [], report: null });
    const [detailGps, setDetailGps] = S.useState({ source: null, record: null });
    const summaryRows = S.useMemo(() =>
      (ride.history || []).filter(row => overlapsKstDay(row, day))
        .map(row => ({ ...row, points: [] })),
      [ride.history, day],
    );
    S.useEffect(() => {
      let active = true;
      loadCalendarGps(ride.history, day, {
        reader: window.__rsGPS42NativeRead,
        cache: gpsCache.current,
        owner: user?.id || "guest",
      }).then(({ records, report }) => {
        if (!active) return;
        setDayGps({ day, source: ride.history, records, report });
        window.__rsTimelineGpsMetrics = report; // Counts/timing only, never raw locations.
        console.info("[RiderSpot] timeline GPS day read", report);
      }).catch(error => {
        if (active) console.warn("[RiderSpot] timeline GPS day read", error?.message);
      });
      return () => { active = false; };
    }, [ride.history, day, user?.id]);
    const dayReady = dayGps.day === day && dayGps.source === ride.history;
    const dayRows = dayReady ? dayGps.records : summaryRows;
    const daily = S.useMemo(() => buildDailyTimeline([
      ...dayRows,
      ...(ride.trip && !ride.trip.ended_at ? [ride.trip] : []),
    ], day), [dayRows, ride.trip, day]);
    const dailyCourse = useRouteAnalysis(
      S,
      selected || ride.trip || allDays ? null : daily?.route,
    );
    // User-tap -> route analysis + two paint frames, in addition to native
    // GPS read timings. The real Android map/paint latency is measured on-device.
    S.useEffect(() => {
      const sample=gpsDayClick.current;
      if(sample.day!==day || sample.logged || !dayReady || selected || allDays) return;
      if(daily?.route?.points?.length && !dailyCourse?.course?.geometry)return;
      if(!Number.isFinite(sample.at))return;
      let cancelled=false,frame1=0,frame2=0;
      frame1=requestAnimationFrame(()=>{
        frame2=requestAnimationFrame(()=>{
          if(cancelled || gpsDayClick.current!==sample)return;
          sample.logged=true;
          const completed=Math.round(((globalThis.performance?.now?.()??Date.now())-sample.at)*10)/10;
          window.__rsTimelineGpsMetrics={
            ...(dayGps.report||{}),routeReadyMs:completed,
            routeFrameApproximation:true,
          };
          console.info("[RiderSpot] timeline day route frame",window.__rsTimelineGpsMetrics);
        });
      });
      return ()=>{cancelled=true;cancelAnimationFrame(frame1);cancelAnimationFrame(frame2);};
    },[day,dayReady,daily?.route?.points?.length,dailyCourse?.course?.geometry,selected,allDays]);

    const currentOriginal =
      ride.history.find(row => row?.id === selected) || ride.trip;
    S.useEffect(() => {
      if (!selected || !currentOriginal?.id) return;
      let active = true;
      loadDetailGps(currentOriginal, {
        reader: window.__rsGPS42NativeRead,
        cache: gpsCache.current,
        owner: user?.id || "guest",
      }).then(record => {
        if (active) setDetailGps({ source: currentOriginal, record });
      }).catch(error => {
        if (active) console.warn("[RiderSpot] timeline GPS detail read", error?.message);
      });
      return () => { active = false; };
    }, [selected, currentOriginal, user?.id]);
    const current = selected && detailGps.source === currentOriginal
      ? detailGps.record : currentOriginal;
    const ended = Boolean(current?.ended_at);
    const isLive = Boolean(ride.trip && current?.id === ride.trip.id && !ended);
    const livePosition = isLive ? timelineLivePosition(ride.position, current) : null;
    S.useEffect(() => setFollowing(false), [current?.id]);
    const analysis = useRouteAnalysis(S, current);
    const dailyPlayback = useRoutePlayback(
      S,
      selected || ride.trip || allDays ? null : daily?.trips,
    );
    const detailPlayback = useRoutePlayback(S, ended ? current : null);
    const raw = analysis?.course;
    const activeRoad =
      roadPreview?.tripId === current?.id &&
      roadPreview?.pointCount === (current?.points?.length || 0)
        ? roadPreview
        : null;
    const shown = activeRoad?.course || raw;
    const stamps = raw?.stamps || EMPTY;
    // Stable references keep Leaflet labels from being repainted by every
    // replay frame. Time markers and stationary events are independent.
    const displayedStamps = S.useMemo(
      () => stamps.filter((stamp) => stamp.kind === "stop" ? showEvents : showStamps),
      [stamps, showEvents, showStamps],
    );
    const dailyStamps = dailyCourse?.course?.stamps || EMPTY;
    const displayedDailyStamps = S.useMemo(
      () => dailyStamps.filter((stamp) => stamp.kind === "stop" ? showEvents : showStamps),
      [dailyStamps, showEvents, showStamps],
    );
    const onStamp = S.useCallback((stamp) => setFocused(stamp), []);
    // One hardware Back closes the individual trip before leaving Timeline.
    S.useEffect(() => {
      if (!selected) return;
      return window.__rsNavigation?.registerLayer("timeline-trip", () => {
        setSelected(null);
        setExpanded(false);
        setFocused(null);
        setRoadPreview(null);
      });
    }, [selected]);
    S.useEffect(() => {
      if (!expanded) return;
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const close = (event) => {
        if (event.key === "Escape") setExpanded(false);
      };
      window.addEventListener("keydown", close);
      const unregister = window.__rsNavigation?.registerLayer("timeline-full-map", () => setExpanded(false));
      return () => {
        unregister?.();
        document.body.style.overflow = previous;
        window.removeEventListener("keydown", close);
      };
    }, [expanded]);
    async function rs38MatchRoads() {
      if (!current || roadBusy) return;
      if (activeRoad) {
        setRoadPreview(null);
        setRoadNotice("GPS 원본 경로를 표시합니다.");
        return;
      }
      const batches = raw?.batches;
      if (!batches) {
        setRoadNotice(
          "도로 보정은 연속 GPS 구간 최대 5개(약 350개 좌표)까지 지원해요.",
        );
        return;
      }
      if (!batches.length) {
        setRoadNotice("도로 보정에 필요한 GPS 좌표가 부족해요.");
        return;
      }
      if (
        !confirm(
          "도로에 맞춰 표시하기 위해 해당 운행의 GPS 좌표를 외부 OSRM 공개 경로 서비스로 보냅니다. GPS 원본·Supabase 저장 경로는 바꾸지 않습니다. 계속할까요?",
        )
      )
        return;
      setRoadBusy(true);
      setRoadNotice("도로를 확인하고 있어요…");
      try {
        const matched = [];
        let skipped = 0;
        for (let i = 0; i < batches.length; i++) {
          const response = await fetch("/api/route-match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ points: batches[i] }),
          });
          const data = await response.json();
          if (!response.ok)
            throw Error(
              data?.message || "도로 경로 서비스를 사용할 수 없어요.",
            );
          const lines = Array.isArray(data.lines) ? data.lines : [];
          if (!lines.length) skipped++;
          for (const line of lines) {
            if (Array.isArray(line) && line.length >= 2) matched.push(line);
          }
          if (i < batches.length - 1)
            await new Promise((resolve) => setTimeout(resolve, 1250));
        }
        if (!matched.length)
          throw Error(
            "GPS 정확도가 부족하거나 도로와 일치하는 경로를 찾지 못했어요.",
          );
        setRoadPreview({
          tripId: current.id,
          pointCount: current.points.length,
          course: analyzeMatchedCourse(matched),
        });
        setRoadNotice(
          skipped
            ? "도로 확인에 실패한 " +
                skipped +
                "개 구간은 표시하지 않았어요. 도로 선은 추정 경로예요."
            : "도로에 맞춘 추정 경로입니다. 실제 운행한 길과 다를 수 있어요.",
        );
      } catch (error) {
        setRoadNotice(
          error?.message ||
            "도로 경로를 불러오지 못했어요. 원본 GPS로 표시합니다.",
        );
      } finally {
        setRoadBusy(false);
      }
    }
    function fit() {
      setFollowing(false);
      setFocused(null);
      setReset(value=>value+1);
    }
    function view(trip) {
      setFinished(false);
      setSelected(trip.id);
      setMemo(trip.memo || "");
      setFocused(null);
      setExpanded(false);
      setRoadPreview(null);
      setRoadNotice("");
    }
    function back() {
      if(current?.started_at) choose(rs33WorkDay(current.started_at));
      setFinished(false);
      setSelected(null);
      setExpanded(false);
      setFocused(null);
      setRoadPreview(null);
    }
    function choose(date) {
      gpsDayClick.current={day:date,at:globalThis.performance?.now?.()??Date.now(),logged:false};
      setDay(date);
      setWeek(rs33WeekStart(date));
      setAllDays(false);
      setFocused(null);
      setReset((value) => value + 1);
    }
    async function finish() {
      if (!ride.trip || ride.busy) return;
      if (!window.confirm("운행 기록을 종료하고 이 기기에 저장할까요?")) return;
      const currentId = ride.trip.id;
      try {
        await ride.finish();
      } catch (error) {
        notify(error.message);
        return;
      }
      setSelected(currentId);
      setMemo("");
      setFocused(null);
      setFinished(true);
    }
    async function saveMemo(event) {
      event.preventDefault();
      if (!current || memoBusy) return;
      setMemoBusy(true);
      try {
        await ride.saveMemo(current.id, memo.trim());
      } catch (error) {
        notify(error.message || "메모를 저장하지 못했어요.");
      } finally {
        setMemoBusy(false);
      }
    }
    function courseToolbar(isDaily) {
      const toggleStamps = () => {
        setShowStamps((value) => {
          const next = !value;
          try { localStorage.setItem("rs:route-time-stamps", next ? "1" : "0"); } catch {}
          return next;
        });
        setFocused(null);
      };
      const toggleEvents = () => {
        setShowEvents((value) => {
          const next = !value;
          try { localStorage.setItem("rs:route-stop-events", next ? "1" : "0"); } catch {}
          return next;
        });
        setFocused(null);
      };
      return rs33J("div", { className: "rs59-course-tools rs12-route-tools", role: "group", "aria-label": "경로 표시 설정" },
        rs33J("div", { className: "rs12-route-filters", role: "group", "aria-label": "지도 정보 표시" },
          rs33J("button", { type: "button", className: "rs59-event-toggle",
            "aria-pressed": showEvents, "aria-label": showEvents ? "이벤트 끄기" : "이벤트 켜기", onClick: toggleEvents }, "이벤트"),
          rs33J("button", { type: "button", className: "rs45-stamp-toggle",
            "aria-pressed": showStamps, "aria-label": showStamps ? "시간 끄기" : "시간 켜기", onClick: toggleStamps }, "시간")),
        rs33J("div", { className: "rs12-route-actions" },
          rs33J("button", { type: "button", className: "rs33-expand rs12-expand",
            "aria-label": expanded ? "닫기" : "크게 보기", "aria-expanded": expanded,
            onClick: () => setExpanded(value => !value) },
            expanded ? "닫기" : "⤢ 크게"),
          !isDaily ? rs33J("details", { className: "rs12-route-more" },
            rs33J("summary", { "aria-label": "경로 추가 옵션" }, "•••"),
            rs33J("div", { className: "rs12-route-more-menu" },
              rs33J("button", { type: "button", className: "rs38-road-toggle",
                "aria-pressed": !!activeRoad, disabled: roadBusy || !raw, onClick: rs38MatchRoads },
                roadBusy ? "보정 중…" : activeRoad ? "원본 경로로 보기" : "도로 보정"))) : null));
    }
    if (current) {
      const path = rs33J(Zo, {
        key: current.id,
        position: livePosition,
        course: {
          id: current.id,
          startPoint: timelineStartPoint(current),
          endPoint: ended ? timelineEndPoint(current) : null,
          live: isLive,
          follow: following && isLive,
          onUnfollow,
          geometry: shown?.geometry,
          stamps: displayedStamps,
          bounds: shown?.bounds,
          fitRequest: reset,
          onStamp,
          playback: detailPlayback.showing
            ? {
                showing: true,
                track: detailPlayback.track,
                elapsed: detailPlayback.elapsed,
              }
            : null,
        },
      });
      const start = rs33Timestamp(current.started_at),
        end = rs33Timestamp(current.ended_at);
      return rs33J(
        "section",
        { className: "trip-page rs33-trip-detail" + (!ended ? " rs33-trip-live" : "") },
        rs33J(
          "div",
          { className: "trip-heading rs-timeline-detail-heading" },
          ended
            ? rs33J("button", {
                type: "button",
                className: "back rs-timeline-back",
                onClick: back,
              }, "‹ 하루 전체")
            : null,
          rs33J(
            "div",
            { className: "rs-timeline-heading-main" },
            rs33J("small", { className: "rs-timeline-heading-eyebrow" },
              ended ? "운행 상세" : "실시간 운행"),
            rs33J("h1", null,
              start
                ? new Intl.DateTimeFormat("ko-KR", {
                    timeZone: rs33Zone,
                    month: "long",
                    day: "numeric",
                    weekday: "short",
                  }).format(new Date(start))
                : "운행 기록"),
          ),
          rs33J(
            "span",
            { className: "rs33-state" + (!ended ? (ride.paused ? " rs33-state-rest" : " rs33-state-live") : "") },
            ended ? "완료" : ride.paused ? "휴식 중" : "기록 중",
          ),
        ),
          !ended
            ? rs33J(
                "div",
                { className: "actions rs-ride-control-bar rs-ride-controls-top", "aria-label": "운행 조작" },
                rs33J(
                  "button",
                  {
                    type: "button",
                    className: "secondary rs-ride-pause",
                    "aria-label": ride.paused ? "운행 재개" : "휴식",
                    onClick: () => Promise.resolve(ride.togglePause()).catch(error => notify(error?.message || "휴식 상태를 바꾸지 못했어요.")),
                    disabled: ride.busy,
                  },
                  ride.paused ? "운행 재개" : "휴식",
                ),
                rs33J(
                  "button",
                  { type: "button", className: "primary rs-ride-finish", "aria-label": "운행 종료", onClick: finish, disabled: ride.busy },
                  ride.busy ? "저장 중…" : "운행 종료",
                ),
              )
            : null,
        rs33J(
          "div",
          {
            className:
              "rs33-course-shell" + (expanded ? " rs33-course-full" : ""),
            role: expanded ? "dialog" : undefined,
            "aria-modal": expanded ? true : undefined,
            "aria-label": expanded ? "전체 화면 운행 지도" : undefined,
          },
          rs33J(
            "div",
            { className: "trip-map rs33-course-map" },
            path,
            !ended
              ? rs33J(
                  "button",
                  {
                    type: "button",
                    className: "rs43-current-position" + (following ? " rs-nav-following" : ""),
                    "aria-label": following ? "현재 위치 자동 추적 끄기" : "지도에서 내 현재 위치로 이동",
                    "aria-pressed": following,
                    onClick: () => {
                      if (following) {
                        setFollowing(false);
                        return;
                      }
                      if (!isTimelineCoordinate(livePosition)) {
                        notify("현재 위치를 확인하는 중이에요.");
                        ride.locate?.().catch(() => {});
                        return;
                      }
                      setFocused(null);
                      setFollowing(true);
                    },
                  },
                  following ? "◉ 추적 중" : "◎ 내 위치",
                )
              : null,
          ),
          ended ? playbackBar(detailPlayback, "개별 운행 경로", fit) : null,
          courseToolbar(false),
          !analysis
            ? rs33J(
                "p",
                { className: "rs33-muted", role: "status" },
                "운행 경로를 불러오는 중…",
              )
            : analysis.error
              ? rs33J(
                  "p",
                  { className: "rs33-muted", role: "alert" },
                  "경로 표시를 완료하지 못했어요.",
                )
              : null,
          roadNotice
            ? rs33J(
                "p",
                { className: "rs38-road-notice", role: "status" },
                roadNotice,
              )
            : null,
          focused && (showStamps || showEvents)
            ? rs33J("div", { className: "rs56-route-focus", role: "status" },
                rs33Time(focused.time) + " · " + focused.label)
            : null,
        ),
        rs33J(
          "div",
          { className: "trip-details rs33-trip-body" },
          rs33J(
            "div",
            { className: "rs33-trip-summary rs-timeline-summary" + (!ended ? " rs33-trip-summary-live" : "") },
            rs33J(
              "div",
              { className: "rs-timeline-summary-distance" },
              rs33J("small", null, "주행 거리"),
              rs33J("strong", null,
                rs33Format.format(Number(current.distance_km) || 0),
                rs33J("span", null, " km"),
              ),
            ),
            rs33J(
              "div",
              { className: "rs-timeline-summary-time" },
              rs33J("small", null, ended ? "운행 시간" : "시작 시각"),
              rs33J("strong", null,
                ended && end && start ? rs33Duration(Math.max(0, end - start))
                  : start ? rs33Time(start) : "—",
              ),
              rs33J("span", null,
                ended
                  ? [start ? rs33Time(start) : "", end ? rs33Time(end) : ""].filter(Boolean).join(" – ")
                  : ride.paused ? "현재 휴식 중" : "운행 중",
              ),
            ),
            raw?.gapCount
              ? rs33J("small", { className: "rs-timeline-gps-note" },
                  "GPS 기록 공백 " + raw.gapCount + "구간")
              : null,
          ),
          finished && ended
            ? rs33J(DayRideCard, {
                history: ride.history,
                day: rs33WorkDay(start),
                celebrate: true, income:rs33J(Income,{day:rs33WorkDay(start),user,login}),
              })
            : null,
          ended
            ? rs33J(
                "form",
                { className: "rs33-trip-memo", onSubmit: saveMemo },
                rs33J("label", { htmlFor: "rs33-trip-memo" }, "운행 메모"),
                rs33J(
                  "div",
                  null,
                  rs33J("input", {
                    id: "rs33-trip-memo",
                    value: memo,
                    maxLength: 140,
                    onChange: (event) => setMemo(event.target.value),
                    placeholder: "예: 점심 피크 · 수완동",
                  }),
                  rs33J(
                    "button",
                    {
                      type: "submit",
                      className: "secondary",
                      disabled: memoBusy,
                    },
                    "저장",
                  ),
                ),
              )
            : null,
          rs33J(
            "section",
            { className: "rs44-events" },
            rs33J(
              "button",
              {
                type: "button",
                className: "rs44-event-toggle",
                "aria-expanded": eventOpen,
                "aria-controls": "rs44-event-list",
                onClick: () => {
                  const value = !eventOpen;
                  setEventOpen(value);
                  try {
                    localStorage.setItem(
                      "rs:trip-events-open",
                      value ? "1" : "0",
                    );
                  } catch {}
                },
              },
              rs33J("span", null, "운행 이벤트"),
              rs33J(
                "span",
                { className: "rs44-count" },
                (current.events || []).length + "개",
              ),
              rs33J(
                "span",
                { className: "rs44-chevron", "aria-hidden": true },
                eventOpen ? "⌃" : "⌄",
              ),
            ),
            eventOpen
              ? rs33J(
                  "ol",
                  {
                    id: "rs44-event-list",
                    className: "timeline rs44-event-list",
                  },
                  (Array.isArray(current.events) ? current.events : EMPTY)
                    .filter((event) => event && typeof event.type === "string")
                    .map((event, i) =>
                      rs33J(
                        "li",
                        { key: i },
                        rs33J("span", { className: "timeline-dot" }),
                        rs33J(
                          "time",
                          null,
                          rs33Timestamp(event.at) ? rs33Time(event.at) : "—",
                        ),
                        rs33J("strong", null, event.type),
                      ),
                    ),
                )
              : null,
          ),
          ended
            ? rs33J(
                "div",
                { className: "actions" },
                rs33J(
                  "button",
                  {
                    type: "button",
                    className: "secondary",
                    onClick: () =>
                      ride
                        .sync(current)
                        .catch((error) => notify(error.message)),
                  },
                  "서버 저장",
                ),
                rs33J(
                  "button",
                  {
                    type: "button",
                    className: "back danger",
                    onClick: async () => {
                      if (!confirm("이 운행 기록을 삭제할까요?")) return;
                      try {
                        await ride.remove(current.id);
                        back();
                      } catch (error) {
                        notify(error.message);
                      }
                    },
                  },
                  "기록 삭제",
                ),
              )
            : null,
        ),
      );
    }
    const history = ride.history.filter((trip) =>
      rs33Timestamp(trip?.started_at),
    );
    const byDay = new Map();
    for (const trip of history) {
      for (const key of calendarDaysForTrip(trip)) {
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(trip);
      }
    }
    const entries = allDays ? history : daily?.trips || [];
    const km = entries.reduce(
      (sum, trip) => sum + (Number(trip.distance_km) || 0),
      0,
    );
    const elapsed = entries.reduce(
      (sum, trip) =>
        sum +
        Math.max(
          0,
          (rs33Timestamp(trip.ended_at) || 0) -
            (rs33Timestamp(trip.started_at) || 0),
        ),
      0,
    );
    const labels = ["월", "화", "수", "목", "금", "토", "일"];
    return rs33J(
      "section",
      { className: "page rs33-timeline rs34-timeline" },
      rs33J(
        "div",
        { className: "rs33-title rs34-timeline-command" },
        rs33J("div",{className:"rs11-journey-heading"},rs33J("h1",null,"타임라인"),
          rs33J("small",{className:"rs34-ride-state",role:"status"},
            ride.trip?(ride.paused?"일시정지 중":"운행 기록 중"):"날짜별 주행 기록")),
        rs33J(
          "button",
          {
            type: "button",
            className: "primary rs34-ride-main-action" + (ride.trip?" is-running":""),
            disabled: ride.busy,
            onClick: ride.trip ? finish : ride.startTrip,
            "aria-label":ride.trip?"운행 종료 후 기록 저장":"운행 시작",
          },
          ride.busy ? (ride.trip?"저장 중…":"위치 확인 중…") : ride.trip ? "운행 종료" : "운행 시작",
        ),
      ),
      rs33J("section",{className:"rs6-timeline-controller rs34-timeline-calendar"},
      rs33J(
        "div",
        { className: "rs33-week-head" },
        rs33J(
          "button",
          {
            type: "button",
            "aria-label": "이전 주",
            onClick: () => choose(rs33DateAdd(week, -7)),
          },
          "‹",
        ),
        rs33J("strong",null,
          Number(day.slice(0, 4)) + "년 " + Number(day.slice(5, 7)) + "월",
          rs33J("small",{className:"rs33-workday-hint"}," · 업무일")
        ),
        rs33J("button", {
          type: "button",
          className: "rs61-today",
          "aria-label": "오늘로 이동",
          onClick: () => choose(today),
          disabled: day === today && !allDays,
        }, "오늘"),
        rs33J(
          "button",
          {
            type: "button",
            "aria-label": "다음 주",
            disabled: week >= rs33WeekStart(today),
            onClick: () => choose(rs33DateAdd(week, 7)),
          },
          "›",
        ),
      ),
      rs33J(
        "div",
        { className: "rs33-week rs-renewal-calendar", role: "group", "aria-label": "운행 날짜" },
        ...labels.map((label, i) => {
          const date = rs33DateAdd(week, i);
          return rs33J(
            "button",
            {
              type: "button",
              key: date,
              disabled: date > today,
              "aria-pressed": date === day && !allDays,
              "aria-label":
                date +
                (byDay.has(date)
                  ? " 운행 " + byDay.get(date).length + "회"
                  : ""),
              onClick: () => choose(date),
            },
            rs33J("small", null, label),
            rs33J("b", null, Number(date.slice(8))),
            rs33J("span", { "data-has-record": byDay.has(date) }),
          );
        }),
      ),
      ),
      allDays
        ? rs33J("div", { className: "rs33-trip-summary" },
            rs33J(Metrics, {
              label: "전체 운행 요약",
              items: [
                ["거리", rs33Format.format(km), "km"],
                ["시간", entries.length ? rs33Duration(elapsed) : "0분", ""],
                ["운행", entries.length, "회"],
              ],
            }),
          )
        : null,
      !allDays && daily
        ? rs33J("section", {
            className: "rs56-day-overview rs-renewal-route rs11-route-first", "aria-label": "하루 통합 운행 경로",
          },
            rs33J("div",{className:"rs7-map-label rs12-map-heading"},
              rs33J("div",{className:"rs12-map-heading-copy"},
                rs33J("strong",null,Number(day.slice(5,7))+"월 "+Number(day.slice(8,10))+"일의 이동"),
                rs33J("span",null,daily.trips.length+"개 운행 구간")),
              rs33J("button",{type:"button",className:"rs-recap-launch rs12-recap-action",
                onClick:()=>setRecapDay(day),disabled:!dayReady,
                "aria-label":day+" 라이딩 이미지를 만들고 저장하기"},
                "↥ 이미지 저장")),
            daily.route.points.length
              ? rs33J(
                  "div",
                  {
                    className:
                      "rs33-course-shell rs56-day-course" +
                      (expanded ? " rs33-course-full" : ""),
                    role: expanded ? "dialog" : undefined,
                    "aria-modal": expanded ? true : undefined,
                    "aria-label": expanded
                      ? "전체 화면 하루 운행 지도"
                      : undefined,
                  },
                  rs33J(
                    "div",
                    { className: "trip-map rs33-course-map rs56-day-map" },
                    rs33J(Zo, {
                      key: daily.route.id,
                      position: day === liveDay && ride.trip && !ride.trip.ended_at
                        ? timelineLivePosition(ride.position, ride.trip)
                        : null,
                      course: {
                        id: daily.route.id,
                        startPoint: timelineStartPoint(daily.route),
                        endPoint: daily.trips.every(trip => Boolean(trip.ended_at))
                          ? timelineEndPoint(daily.route) : null,
                        live: day === liveDay && Boolean(ride.trip && !ride.trip.ended_at),
                        follow: following && day === liveDay && Boolean(ride.trip && !ride.trip.ended_at),
                        onUnfollow,
                        geometry: dailyCourse?.course?.geometry,
                        stamps: displayedDailyStamps,
                        bounds: dailyCourse?.course?.bounds,
                        fitRequest: reset,
                        onStamp,
                        playback: dailyPlayback.showing
                          ? {
                              showing: true,
                              track: dailyPlayback.track,
                              elapsed: dailyPlayback.elapsed,
                            }
                          : null,
                      },
                    }),
                  ),
                  day === liveDay && ride.trip && !ride.trip.ended_at
                    ? rs33J("button", {
                        type: "button",
                        className: "rs-nav-follow rs56-day-follow" + (following ? " rs-nav-following" : ""),
                        "aria-label": following ? "현재 위치 자동 추적 끄기" : "지도에서 내 현재 위치로 이동",
                        "aria-pressed": following,
                        onClick: () => {
                          if (following) { setFollowing(false); return; }
                          const point = timelineLivePosition(ride.position, ride.trip);
                          if (!isTimelineCoordinate(point)) {
                            notify("현재 위치를 확인하는 중이에요.");
                            ride.locate?.().catch(() => {});
                            return;
                          }
                          setFocused(null);
                          setFollowing(true);
                        },
                      }, following ? "◉ 추적 중" : "◎ 내 위치")
                    : null,
                  playbackBar(dailyPlayback, "하루 통합 경로", fit),
                  courseToolbar(true),
                  dailyCourse?.error
                    ? rs33J(
                        "p",
                        { className: "rs33-muted", role: "alert" },
                        "통합 경로를 표시하지 못했어요. 개별 운행 기록은 그대로 남아 있어요.",
                      )
                    : !dailyCourse
                      ? rs33J(
                          "p",
                          { className: "rs33-muted", role: "status" },
                          "하루 운행 경로를 연결하지 않고 모으는 중…",
                        )
                      : null,
                  focused && (showStamps || showEvents)
                    ? rs33J("div", { className: "rs56-route-focus", role: "status" },
                        rs33Time(focused.time) + " · " + focused.label)
                    : null,
                  showEvents && dailyCourse?.course?.stamps?.some((stamp) => stamp.kind === "stop")
                    ? rs33J("details", { className: "rs56-stop-events" },
                        rs33J("summary", null,
                          "정차 ",
                          rs33J("strong", null, dailyCourse.course.stamps.filter((stamp) => stamp.kind === "stop").length + "건"),
                          rs33J("span", { "aria-hidden": true }, "⌄")),
                        rs33J("div", { className: "rs56-stop-list" },
                          dailyCourse.course.stamps.filter((stamp) => stamp.kind === "stop").map((stamp, index) =>
                            rs33J("button", {
                              type: "button", key: "stop:" + stamp.time + ":" + index,
                              onClick: () => setFocused(stamp),
                              "aria-label": rs33Time(stamp.time) + " " + stamp.label,
                            },
                              rs33J("time", null, rs33Time(stamp.time)),
                              rs33J("span", null, stamp.label),
                              stamp.inferred ? rs33J("small", null, "GPS 추정") : null,
                            ),
                          ),
                        ),
                      )
                    : null,

                )
              : rs33J(
                  "div",
                  { className: "rs56-day-empty" },
                  dayReady ? "GPS 경로 없음" : "기기 GPS 경로 읽는 중…",
                ),
          )
        : null,

      !allDays ? rs33J("section",{className:"rs11-timeline-insights","aria-label":"운행 결산"},
        rs33J(DayRideCard,{history:ride.history,day,income:rs33J(Income,{key:day,day,user,login})})) : null,
      recapDay ? rs33J(RideRecap,{day:recapDay,history:[
        ...dayRows, ...(ride.trip && !ride.trip.ended_at ? [ride.trip] : []),
      ],user,notify,
        onClose:()=>setRecapDay(null)}) : null,
      rs33J(
        "div",
        { className: "rs33-list-title" },
        rs33J("h2", null, allDays ? "운행 기록" : "운행 구간"),
        rs33J(
          "div",
          { className: "rs61-list-actions" },
          rs33J(
            "button",
            { type: "button", className: "back", onClick: () => setAllDays((value) => !value) },
            allDays ? "선택 날짜" : "전체 기록",
          ),
          rs33J(
            "button",
            {
              type: "button", className: "back",
              "aria-expanded": ridesOpen,
              "aria-label": "개별 운행 목록 " + (ridesOpen ? "접기" : "펼치기"),
              onClick: () => setRidesOpen((v) => !v),
            },
            ridesOpen ? "접기 ⌃" : "펼치기 ⌄",
          ),
        ),
      ),
      entries.length && ridesOpen
        ? rs33J(
            "div",
            {
              className: "rs56-rides",
              role: "group",
              "aria-label": "개별 운행 구간",
            },
            ...entries.map((trip, index) => {
              const tripStart = rs33Timestamp(trip.started_at);
              const tripEnd = rs33Timestamp(trip.ended_at);
              const distance = Math.max(0, Number(trip.distance_km) || 0);
              const dateNote =
                allDays && tripStart ? rs33WorkDay(tripStart).slice(5) + " · " : "";
              const endLabel =
                tripEnd && tripStart && rs33ISO(tripEnd) !== rs33ISO(tripStart)
                  ? rs33ISO(tripEnd).slice(5) + " " + rs33Time(tripEnd)
                  : tripEnd
                    ? rs33Time(tripEnd)
                    : "진행 중";
              return rs33J(
                "button",
                {
                  type: "button",
                  className: "rs56-ride-choice",
                  key: trip.id,
                  onClick: () => view(trip),
                  "aria-label":
                    (trip.memo ? trip.memo + ", " : "") +
                    (allDays ? "" : index + 1 + "차, ") +
                    dateNote +
                    rs33Time(tripStart) +
                    "부터 " +
                    endLabel +
                    ", " +
                    rs33Format.format(distance) +
                    "킬로미터, 상세 보기",
                },
                rs33J(
                  "span",
                  { className: "rs56-ride-number", "aria-hidden": true },
                  allDays ? "↗" : String(index + 1).padStart(2, "0"),
                ),
                rs33J(
                  "span",
                  { className: "rs56-ride-info" },
                  rs33J(
                    "strong",
                    null,
                    dateNote + rs33Time(tripStart) + " – " + endLabel,
                  ),
                  rs33J(
                    "small",
                    null,
                    rs33Format.format(distance) +
                      " km · " +
                      (!(trip.gps_native || Number(trip.gps_point_count) > 0 ||
                      trip.points?.some(
                        (p) =>
                          Number.isFinite(p?.lat) && Number.isFinite(p?.lng),
                      ))
                        ? "GPS 경로 없음"
                        : distance === 0
                          ? "이동 거리 없음"
                          : rs33Duration(
                              Math.max(0, (tripEnd || tripStart) - tripStart),
                            )) +
                      (trip.memo ? " · " + trip.memo : ""),
                  ),
                ),
                rs33J(
                  "span",
                  { className: "rs56-ride-link", "aria-hidden": true },
                  "보기 ›",
                ),
              );
            }),
          )
        : entries.length
          ? null
          : rs33J(
              "p",
              { className: "rs33-empty" },
              "이날 저장된 운행 기록이 없어요.",
            ),
    );
  }
  return ss;
}
