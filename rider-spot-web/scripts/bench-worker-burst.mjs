import worker from '../edge/static-edge.mjs';
import { performance } from 'node:perf_hooks';

// Exercise only local request routing. No live accounts, sockets or external APIs.
const env = { LEGACY: { fetch: async req => Response.json({ path: new URL(req.url).pathname }) } };
for (const concurrency of [100, 500, 1000, 3000]) {
  const start = performance.now();
  const samples = await Promise.all(Array.from({ length: concurrency }, async () => {
    const before = performance.now();
    const path = '/api/weather';
    const response = await worker.fetch(new Request('https://bench.invalid' + path), env);
    if (response.status !== 200 || (await response.json()).path !== path) throw Error('Bad route');
    return performance.now() - before;
  }));
  samples.sort((a,b) => a-b);
  const percentile = p => +samples[Math.ceil(p * samples.length)-1].toFixed(2);
  console.log({ concurrency, p50: percentile(.5), p95: percentile(.95),
    p99: percentile(.99), elapsedMs: Math.round(performance.now()-start) });
}
