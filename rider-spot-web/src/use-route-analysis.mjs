import { analyzeCourse } from "./route-analysis.mjs";

const finishedCache = new WeakMap();
export function useRouteAnalysis(React, trip) {
  const [result, setResult] = React.useState(null);
  const worker = React.useRef(null);
  const active = React.useRef(null);
  const queued = React.useRef(null);
  React.useEffect(() => {
    if (!trip) return;
    try {
      worker.current = new Worker(
        new URL("./route-worker.mjs", import.meta.url),
        { type: "module" },
      );
    } catch {
      /* Fall back if this browser has workers disabled. */
    }
    return () => {
      worker.current?.terminate();
      worker.current = null;
      active.current = queued.current = null;
    };
  }, [trip?.id]);
  React.useEffect(() => {
    if (!trip) return;
    const known =
      trip.ended_at && trip.points && finishedCache.get(trip.points);
    if (known && known.events === trip.events) {
      setResult({ tripId: trip.id, course: known.course });
      return;
    }
    function done(course, error) {
      if (course && trip.ended_at && trip.points)
        finishedCache.set(trip.points, { course, events: trip.events });
      setResult({ tripId: trip.id, course, error });
    }
    function send() {
      const thread = worker.current;
      if (!thread) {
        const timer = setTimeout(() => {
          try {
            done(analyzeCourse(trip.points, trip.events));
          } catch (error) {
            done(null, error.message);
          }
        });
        return () => clearTimeout(timer);
      }
      active.current = send;
      thread.onmessage = ({ data }) => {
        if (active.current !== send) return;
        active.current = null;
        done(data.course, data.error);
        const next = queued.current;
        queued.current = null;
        next?.();
      };
      thread.onerror = () => {
        if (active.current !== send) return;
        active.current = null;
        thread.terminate();
        worker.current = null;
        const next = queued.current;
        queued.current = null;
        (next || send)();
      };
      thread.postMessage({
        requestId: trip.id,
        points: trip.points,
        events: trip.events,
      });
    }
    if (active.current) queued.current = send;
    else return send();
  }, [trip?.id, trip?.points, trip?.events, trip?.ended_at]);
  return result?.tripId === trip?.id ? result : null;
}
