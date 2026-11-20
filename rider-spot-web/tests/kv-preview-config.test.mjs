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
  assert.equal(bindings.LEGACY,"rider-spot-backend");
  assert.notEqual(bindings.LEGACY,production);
  assert.notEqual(bindings.ASSETS,front.name);
  assert.notEqual(bindings.LEGACY,front.name);
  assert.deepEqual(front.services.map(b=>b.binding).sort(),["ASSETS","LEGACY"]);
});
test("future direct Static Assets preview cannot accidentally overwrite production",()=>{
  const target=read("wrangler.static-preview.json");
  assert.equal(target.name,"rider-spot-static-preview");
  assert.notEqual(target.name,production);
  assert.equal(target.assets.directory,"./dist");
  assert.equal(target.assets.binding,"ASSETS");
  assert.equal(target.services.length,1);
  assert.notEqual(target.name,target.services[0].service);
  assert.equal(target.services[0].service,"rider-spot-backend");
});
