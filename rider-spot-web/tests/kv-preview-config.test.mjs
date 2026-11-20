import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=name=>JSON.parse(readFileSync(new URL("../"+name,import.meta.url),"utf8"));
const production="rider-spot";

test("KV preview gateway and front have independent names",()=>{
  const gateway=read("wrangler.kv-assets-preview.json");
  const front=read("wrangler.kv-front-preview.json");
  assert.equal(gateway.name,"rider-spot-static-candidate-assets");
  assert.equal(front.name,"rider-spot-static-preview");
  assert.notEqual(gateway.name,production);
  assert.notEqual(front.name,production);
  assert.equal(gateway.main,"edge/kv-preview-assets.mjs");
  assert.equal(front.main,"edge/static-edge.mjs");
  assert.equal(gateway.kv_namespaces?.[0].binding,"RS_ASSETS");
  assert.match(gateway.kv_namespaces?.[0].id||"",/^[0-9a-f]{32}$/);
});
test("staging front binds to separate KV gateway and isolated backend, never itself",()=>{
  const front=read("wrangler.kv-front-preview.json");
  const bindings=Object.fromEntries(front.services.map(b=>[b.binding,b.service]));
  assert.equal(bindings.ASSETS,"rider-spot-static-candidate-assets");
  assert.equal(bindings.LEGACY,"rider-spot-api-core-qa");
  assert.notEqual(bindings.LEGACY,production);
  assert.notEqual(bindings.ASSETS,front.name);
  assert.notEqual(bindings.LEGACY,front.name);
  assert.deepEqual(front.services.map(b=>b.binding).sort(),["ASSETS","DESIGN","LEGACY"]);
  assert.equal(bindings.DESIGN,"rider-spot-visual-v2");
});
test("future direct Static Assets preview cannot accidentally overwrite production",()=>{
  const target=read("wrangler.static-preview.json");
  assert.equal(target.name,"rider-spot-static-preview");
  assert.notEqual(target.name,production);
  assert.equal(target.assets.directory,"./dist");
  assert.equal(target.assets.binding,"ASSETS");
  assert.equal(target.services.length,1);
  assert.notEqual(target.name,target.services[0].service);
  assert.equal(target.services[0].service,"rider-spot-api-core-qa");
});


test("API core is independently named, tiny and has only the frozen legacy fallback",()=>{
  const core=read("wrangler.api-core-preview.json");
  const front=read("wrangler.kv-front-preview.json");
  assert.equal(core.name,"rider-spot-api-core-qa");
  assert.equal(core.main,"edge/api-core.mjs");
  assert.equal(core.workers_dev,false);
  assert.notEqual(core.name,production);
  assert.notEqual(core.name,front.name);
  assert.deepEqual(core.services,[{binding:"LEGACY_BACKEND",service:"rider-spot-backend"}]);
  assert.notEqual(core.services[0].service,core.name);
  assert.equal(front.services.find(x=>x.binding==="LEGACY").service,core.name);
});


test("production config matches live split routing and never loops to its own Worker",()=>{
  const live=read("wrangler.kv-front-production.json");
  assert.equal(live.name,production);
  assert.equal(live.main,"edge/static-edge.mjs");
  assert.equal(live.workers_dev,true);
  assert.equal(live.compatibility_date,"2026-11-19");
  assert.equal(live.assets,undefined,"Cloudflare static upload is not configured on KV production path");
  assert.deepEqual(live.services,[
    {binding:"ASSETS",service:"rider-spot-static-candidate-assets"},
    {binding:"LEGACY",service:"rider-spot-api-core-qa"},
    {binding:"DESIGN",service:"rider-spot-visual-v2"}
  ]);
  assert.ok(live.services.every(x=>x.service!==production));
  assert.equal(read("wrangler.api-core-preview.json").services[0].service,"rider-spot-backend");
  const edge=readFileSync(new URL("../edge/static-edge.mjs",import.meta.url),"utf8");
  assert.ok(edge.includes('"x-rs-fallback"')&&edge.includes('const original = () =>'),
    "v220 emergency shell failover must remain available");
});

test("visual refinement is a separate static-only service and never touches location or records",()=>{
  const design=read("wrangler.visual-v2.json");
  const front=read("wrangler.kv-front-preview.json");
  assert.equal(design.name,"rider-spot-visual-v2");
  assert.equal(design.main,"edge/visual-v2-worker.mjs");
  assert.equal(design.workers_dev,false);
  assert.equal(front.services.find(x=>x.binding==="DESIGN").service,design.name);
  assert.equal(design.services,undefined,"visual Worker must have no data-service binding");
});
