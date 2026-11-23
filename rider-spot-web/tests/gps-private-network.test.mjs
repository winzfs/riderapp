import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

test('trip writes remove GPS and checkpoint writes stop for both URL forms', async () => {
  const requests = [];
  const window = { fetch: async (url, init) => { requests.push(JSON.parse(init.body)); return new Response(); } };
  vm.runInNewContext(readFileSync(new URL('../src/gps-private-network-guard-v50.js', import.meta.url), 'utf8'),
    {window, URL, Request, Response, console});
  const base = 'https://qkcqzhkvfbymzjdktshp.supabase.co/rest/v1/';
  for (const suffix of ['', '/']) {
    const init = {method:'POST', body: JSON.stringify({points:[{lat:1,lng:2}],events:[{type:'stop',at:'now',lat:1}]})};
    await window.fetch(base + 'trips' + suffix, init);
    assert.equal((await window.fetch(base + 'rider_trip_checkpoints' + suffix, init)).status,403);
  }
  assert.deepEqual(requests,Array.from({length:2},()=>({points:[],events:[{type:'stop',at:'now'}]})));
});
