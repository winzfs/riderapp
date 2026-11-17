import { createUI } from "./ui.mjs";
import {
  rs33Zone,
  rs33ISO,
  rs33Time,
  rs33Format,
  rs33DateAdd,
  rs33WeekStart,
  rs33Duration,
} from "./timeline-dates.mjs";
import { rs33Timestamp, analyzeMatchedCourse } from "./route-analysis.mjs";
import { useRouteAnalysis } from "./use-route-analysis.mjs";
import { buildDailyTimeline } from "./daily-timeline.mjs";
import { useRoutePlayback } from "./route-playback.mjs";
import { createGamificationUI } from "./gamification-ui.mjs";
import { timelineStartPoint, timelineLivePosition, isTimelineCoordinate } from "./timeline-location.mjs";

export function createTimeline(S, Zo) {
  const rs33J = S.createElement;
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
  function playbackBar(player, label) {
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
        player.showing
          ? rs33J(
              "button",
              {
                type: "button",
                className: "rs59-reset",
                onClick: player.reset,
                "aria-label": "경로 재생 종료하고 전체 경로 보기",
              },
              "전체 경로",
            )
          : null,
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
            : "실제 GPS 속도 기준",
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
  function ss({ ride, notify }) {
    const today = rs33ISO(Date.now());
    const [selected, setSelected] = S.useState(null);
    const [day, setDay] = S.useState(today);
    const [week, setWeek] = S.useState(rs33WeekStart(today));
    const [expanded, setExpanded] = S.useState(false);
    const [focused, setFocused] = S.useState(null);
    const [reset, setReset] = S.useState(0);
    const [memo, setMemo] = S.useState("");
    const [memoBusy, setMemoBusy] = S.useState(false);
    const [finished, setFinished] = S.useState(false);
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
    const [roadPreview, setRoadPreview] = S.useState(null);
    const [roadBusy, setRoadBusy] = S.useState(false);
    const [roadNotice, setRoadNotice] = S.useState("");
    // Compose only a read-only projection: original run ids, coordinates and
    // on-device GPS stores remain independent.
    const daily = S.useMemo(
      () => buildDailyTimeline(ride.history, day),
      [ride.history, day],
    );
    const dailyCourse = useRouteAnalysis(
      S,
      selected || ride.trip || allDays ? null : daily?.route,
    );
    const current =
      ride.history.find((row) => row?.id === selected) || ride.trip;
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
    const onStamp = S.useCallback((stamp) => setFocused(stamp), []);
    S.useEffect(() => {
      if (!expanded) return;
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const close = (event) => {
        if (event.key === "Escape") setExpanded(false);
      };
      window.addEventListener("keydown", close);
      return () => {
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
      setFinished(false);
      setSelected(null);
      setExpanded(false);
      setFocused(null);
      setRoadPreview(null);
    }
    function choose(date) {
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
    if (current) {
      const path = rs33J(Zo, {
        key: current.id,
        position: livePosition,
        course: {
          id: current.id,
          startPoint: timelineStartPoint(current),
          live: isLive,
          follow: following && isLive,
          onUnfollow,
          geometry: shown?.geometry,
          stamps: showStamps ? stamps : EMPTY,
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
          { className: "trip-heading" },
          rs33J(
            "button",
            {
              type: "button",
              className: "back",
              onClick: back,
              disabled: !ended,
            },
            ended ? "‹ 운행 목록" : "운행 기록 중",
          ),
          rs33J(
            "h1",
            null,
            start
              ? new Intl.DateTimeFormat("ko-KR", {
                  timeZone: rs33Zone,
                  month: "long",
                  day: "numeric",
                  weekday: "short",
                }).format(new Date(start))
              : "운행 기록",
          ),
          rs33J(
            "span",
            { className: "rs33-state" + (!ended ? (ride.paused ? " rs33-state-rest" : " rs33-state-live") : "") },
            ended ? "나만 보기" : ride.paused ? "휴식 중" : "기록 중",
          ),
        ),
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
            { className: "rs33-course-controls" },
            rs33J(
              "button",
              {
                type: "button",
                disabled: !shown?.bounds,
                onClick: () => {
                  setFocused(null);
                  setReset((value) => value + 1);
                },
              },
              "전체 경로",
            ),
            rs33J(
              "button",
              {
                type: "button",
                className: "rs38-road-toggle",
                "aria-pressed": !!activeRoad,
                disabled: roadBusy || !raw,
                onClick: rs38MatchRoads,
              },
              roadBusy ? "확인 중…" : activeRoad ? "원본 경로" : "도로 보정",
            ),
            rs33J(
              "button",
              {
                type: "button",
                className: "rs33-expand",
                "aria-expanded": expanded,
                onClick: () => setExpanded((value) => !value),
              },
              expanded ? "닫기" : "크게 보기",
            ),
            rs33J(
              "button",
              {
                type: "button",
                className: "rs45-stamp-toggle",
                "aria-pressed": showStamps,
                "aria-label": showStamps
                  ? "경로 시간 표시 숨기기"
                  : "경로 시간 표시 켜기",
                onClick: () => {
                  setShowStamps((value) => {
                    const next = !value;
                    try {
                      localStorage.setItem(
                        "rs:route-time-stamps",
                        next ? "1" : "0",
                      );
                    } catch {}
                    return next;
                  });
                  setFocused(null);
                },
              },
              showStamps ? "시간 숨기기" : "시간 켜기",
            ),
          ),
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
          ended ? playbackBar(detailPlayback, "개별 운행 경로") : null,
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
          rs33J(
            "div",
            { className: "rs33-course-footer" },
            shown?.revisitCount
              ? rs33J(
                  "div",
                  { className: "rs43-revisit-key" },
                  "주황색은 출발 구간 · 회색 외곽선은 재통과 추정 (2회/3회/4회 이상)",
                )
              : null,
            rs33J(
              "div",
              { className: "rs33-course-legend" },
              rs33J("span", { "aria-hidden": true }),
              rs33J("small", null, "주황색 출발 → 진한 녹색 마지막 기록"),
              showStamps && focused
                ? rs33J(
                    "b",
                    null,
                    rs33Time(focused.time) + " · " + focused.label,
                  )
                : null,
            ),
            showStamps && stamps.length
              ? rs33J(
                  "div",
                  {
                    className: "rs33-stamp-list",
                    "aria-label": "경로 시간 스탬프",
                  },
                  stamps.map((stamp, i) =>
                    rs33J(
                      "button",
                      {
                        type: "button",
                        key: stamp.kind + ":" + stamp.time + ":" + i,
                        "aria-pressed": focused?.time === stamp.time,
                        onClick: () => setFocused(stamp),
                      },
                      rs33Time(stamp.time),
                      stamp.kind === "start"
                        ? " 출발"
                        : stamp.kind === "end"
                          ? " 마지막"
                          : stamp.kind === "stop"
                            ? " 정차"
                            : "",
                    ),
                  ),
                )
              : showStamps
                ? rs33J(
                    "p",
                    { className: "rs33-muted" },
                    "지도에 표시할 GPS 시간이 없어요.",
                  )
                : null,
          ),
        ),
        rs33J(
          "div",
          { className: "trip-details rs33-trip-body" },
          rs33J(
            "div",
            { className: "rs33-trip-summary" + (!ended ? " rs33-trip-summary-live" : "") },
            rs33J(
              "strong",
              null,
              rs33Format.format(Number(current.distance_km) || 0) + " km",
            ),
            rs33J(
              "span",
              null,
              [
                start ? rs33Time(start) : "",
                end
                  ? start && rs33ISO(start) === rs33ISO(end)
                    ? rs33Time(end)
                    : rs33ISO(end).slice(5) + " " + rs33Time(end)
                  : "운행 중",
              ]
                .filter(Boolean)
                .join(" – "),
            ),
            rs33J(
              "small",
              null,
              end && start ? rs33Duration(end - start) : "운행 중",
              raw?.gapCount ? " · GPS 기록 공백 " + raw.gapCount + "구간" : "",
            ),
          ),
          !ended
            ? rs33J(
                "div",
                { className: "actions rs-ride-control-bar", "aria-label": "운행 조작" },
                rs33J(
                  "button",
                  {
                    type: "button",
                    className: "secondary rs-ride-pause",
                    onClick: () => Promise.resolve(ride.togglePause()).catch(error => notify(error?.message || "휴식 상태를 바꾸지 못했어요.")),
                    disabled: ride.busy,
                  },
                  ride.paused ? "운행 재개" : "휴식",
                ),
                rs33J(
                  "button",
                  { type: "button", className: "primary rs-ride-finish", onClick: finish, disabled: ride.busy },
                  ride.busy ? "저장 중…" : "운행 종료",
                ),
              )
            : null,
          finished && ended
            ? rs33J(DayRideCard, {
                history: ride.history,
                day: rs33ISO(start),
                celebrate: true,
              })
            : null,
          finished && ended
            ? rs33J(
                "button",
                {
                  type: "button",
                  className: "primary rs33-income-link",
                  onClick: () => window.__rsOpenTool?.("earnings"),
                },
                "이어서 수익 기록",
              )
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
          ended
            ? null
            : rs33J(
                "p",
                { className: "rs33-muted" },
                "운행 경로는 기기에 기록 중입니다. GPS 저장 상태를 확인할 수 있어요.",
              ),
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
      const key = rs33ISO(trip.started_at);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(trip);
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
      { className: "page rs33-timeline" },
      rs33J(
        "div",
        { className: "rs33-title" },
        rs33J("h1", null, "타임라인"),
        rs33J(
          "button",
          {
            type: "button",
            className: "primary",
            disabled: ride.busy,
            onClick: ride.startTrip,
          },
          ride.busy ? "위치 확인 중…" : "운행 시작",
        ),
      ),
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
        rs33J(
          "strong",
          null,
          Number(day.slice(0, 4)) + "년 " + Number(day.slice(5, 7)) + "월",
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
        { className: "rs33-week", role: "group", "aria-label": "운행 날짜" },
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
      rs33J(
        "div",
        { className: "rs33-trip-summary" },
        rs33J(
          "small",
          null,
          allDays
            ? "전체 운행"
            : day === today
              ? "오늘 운행"
              : day.slice(5).replace("-", "월 ") + "일 운행",
        ),
        rs33J(Metrics, {
          label: "하루 운행 요약",
          items: [
            ["거리", rs33Format.format(km), "km"],
            ["시간", entries.length ? rs33Duration(elapsed) : "0분", ""],
            ["운행", entries.length, "회"],
          ],
        }),
        rs33J("span", null, "나만 볼 수 있는 운행 기록"),
      ),
      !allDays && daily
        ? rs33J(
            "section",
            {
              className: "rs56-day-overview",
              "aria-label": "하루 통합 운행 경로",
            },
            rs33J(
              "div",
              { className: "rs56-day-header" },
              rs33J(
                "div",
                null,

                rs33J("h2", null, "하루 전체 경로"),
                rs33J("p", null, "출발부터 마지막 기록까지"),
              ),
              rs33J(
                "span",
                { className: "rs56-day-badge" },
                "전체 " + entries.length + "회",
              ),
            ),
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
                    { className: "rs33-course-controls rs56-day-controls" },
                    rs33J(
                      "button",
                      {
                        type: "button",
                        disabled: !dailyCourse?.course?.bounds,
                        onClick: () => {
                          setFocused(null);
                          setReset((value) => value + 1);
                        },
                      },
                      "전체 경로",
                    ),
                    rs33J(
                      "button",
                      {
                        type: "button",
                        className: "rs33-expand",
                        "aria-expanded": expanded,
                        onClick: () => setExpanded((value) => !value),
                      },
                      expanded ? "닫기" : "크게 보기",
                    ),
                    rs33J(
                      "button",
                      {
                        type: "button",
                        className: "rs45-stamp-toggle",
                        "aria-pressed": showStamps,
                        onClick: () => {
                          setShowStamps((value) => {
                            const next = !value;
                            try {
                              localStorage.setItem(
                                "rs:route-time-stamps",
                                next ? "1" : "0",
                              );
                            } catch {}
                            return next;
                          });
                          setFocused(null);
                        },
                      },
                      showStamps ? "시간 숨기기" : "시간 켜기",
                    ),
                  ),
                  rs33J(
                    "div",
                    { className: "trip-map rs33-course-map rs56-day-map" },
                    rs33J(Zo, {
                      key: daily.route.id,
                      position: day === today && ride.trip && !ride.trip.ended_at
                        ? timelineLivePosition(ride.position, ride.trip)
                        : null,
                      course: {
                        id: daily.route.id,
                        startPoint: timelineStartPoint(daily.route),
                        live: day === today && Boolean(ride.trip && !ride.trip.ended_at),
                        follow: following && day === today && Boolean(ride.trip && !ride.trip.ended_at),
                        onUnfollow,
                        geometry: dailyCourse?.course?.geometry,
                        stamps: showStamps
                          ? dailyCourse?.course?.stamps || EMPTY
                          : EMPTY,
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
                  day === today && ride.trip && !ride.trip.ended_at
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
                  playbackBar(dailyPlayback, "하루 통합 경로"),
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
                  rs33J(
                    "div",
                    { className: "rs56-day-map-footer" },
                    rs33J("span", {
                      className: "rs56-gradient-key",
                      "aria-hidden": true,
                    }),
                    rs33J("span", null, "주황색 출발 → 진한 녹색 마지막 기록"),
                    dailyCourse?.course?.revisitCount
                      ? rs33J("small", null, "회색 외곽선은 재통과 추정")
                      : null,
                    showStamps && focused
                      ? rs33J(
                          "strong",
                          { className: "rs56-stamp-detail" },
                          rs33Time(focused.time) + " · " + focused.label,
                        )
                      : null,
                  ),
                )
              : rs33J(
                  "div",
                  { className: "rs56-day-empty" },
                  "운행 기록은 있지만 저장된 GPS 경로가 없어요.",
                ),
            rs33J(
              "p",
              { className: "rs56-day-help" },
              "운행 사이의 기록이 없는 구간은 연결하지 않아요.",
            ),
          )
        : null,
      !allDays ? rs33J(DayRideCard, { history: ride.history, day }) : null,
      rs33J(
        "div",
        { className: "rs33-list-title" },
        rs33J("h2", null, allDays ? "모든 운행 기록" : "개별 운행 선택"),
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
                allDays && tripStart ? rs33ISO(tripStart).slice(5) + " · " : "";
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
                      (!trip.points?.some(
                        (p) =>
                          Number.isFinite(p?.lat) && Number.isFinite(p?.lng),
                      )
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
