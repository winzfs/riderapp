import { performance } from 'node:perf_hooks';
import { buildDailyTimeline } from '../src/daily-timeline.mjs';

const history = Array.from({ length: 10000 }, (_, id) => {
  const start = Date.UTC(2026, 0, 1) + id * 1800000;
  return { id, started_at: new Date(start).toISOString(),
    ended_at: new Date(start + 900000).toISOString(), distance_km: 2 };
});
const elapsed = [];
for (let run = 0; run < 55; run++) {
  const start = performance.now();
  const result = buildDailyTimeline(history, '2026-01-20');
  if (result.trips.length !== 48 || result.distanceKm !== 96) throw Error('Unexpected daily totals');
  if (run >= 5) elapsed.push(performance.now() - start);
}
elapsed.sort((a,b) => a-b);
console.log(JSON.stringify({ samples: elapsed.length, history: history.length,
  p50_ms: elapsed[24], p95_ms: elapsed[47] }));
