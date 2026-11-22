import { rs33Timestamp } from "./route-analysis.mjs";

/**
 * Display-only event projection. Native/manual events remain untouched.
 * GPS-inferred stops are shown with their source and are NEVER persisted as
 * native-recorded stops or uploaded as new trip events.
 */
export function timelineDisplayEvents(events, stamps) {
  const recorded = Array.isArray(events)
    ? events.filter((event) => event && typeof event.type === "string")
    : [];
  const inferred = (Array.isArray(stamps) ? stamps : [])
    .filter((stamp) =>
      stamp?.kind === "stop" &&
      stamp.inferred === true &&
      rs33Timestamp(stamp.time) !== null)
    .map((stamp) => ({
      type: stamp.label || "정차 추정",
      at: new Date(rs33Timestamp(stamp.time)).toISOString(),
      inferred: true,
    }));
  return [...recorded, ...inferred].sort(
    (a, b) => (rs33Timestamp(a.at) || 0) - (rs33Timestamp(b.at) || 0),
  );
}
