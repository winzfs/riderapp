import test from "node:test";
import assert from "node:assert/strict";
import worker,{assetKey,RELEASE_HASH} from "../edge/kv-preview-assets.mjs";

test("KV preview limits requests to the immutable release and public map data",()=>{
  assert.equal(assetKey("/"),"rs-asset-v1::/index.html");
  assert.equal(assetKey("/index.html"),"rs-asset-v1::/index.html");
  assert.equal(assetKey("/sw.js"),"rs-asset-v1::/sw.js");
  assert.equal(assetKey("/assets/rider-spot-"+RELEASE_HASH+"/premium-shell.css"),
    "rs-asset-v1::/assets/rider-spot-"+RELEASE_HASH+"/premium-shell.css");
  assert.equal(assetKey("/mapdata/manifest.json"),"rs-asset-v1::/mapdata/manifest.json");
  assert.equal(assetKey("/assets/rider-spot-06a4d2f6010a/app.mjs"),null);
  assert.equal(assetKey("/mapdata/../../user.sqlite"),null);
  assert.equal(assetKey("/api/trips"),null);
});
const env={RS_ASSETS:{
  async get(key,type) {
    assert.equal(type,"arrayBuffer");
    if(key.includes("missing"))return null;
    return new TextEncoder().encode(key).buffer;
  }
}};
test("KV serves HTML without upstream GitHub security headers",async()=>{
  const r=await worker.fetch(new Request("https://preview.example/index.html"),env);
  assert.equal(r.status,200);
  assert.equal(r.headers.get("cache-control"),"no-store");
  assert.equal(r.headers.get("content-security-policy"),null);
  assert.equal(r.headers.get("x-rs-preview-asset-origin"),"workers-kv");
  assert.equal(await r.text(),"rs-asset-v1::/index.html");
});
test("hashed assets are immutable and HEAD stays body-free",async()=>{
  const url="https://preview.example/assets/rider-spot-"+RELEASE_HASH+"/app.mjs";
  const r=await worker.fetch(new Request(url,{method:"HEAD"}),env);
  assert.equal(r.status,200);
  assert.equal(r.headers.get("cache-control"),"public, max-age=31536000, immutable");
  assert.equal(await r.text(),"");
});
test("old releases and user routes never hit preview KV",async()=>{
  const r=await worker.fetch(new Request("https://preview.example/api/trips"),env);
  assert.equal(r.status,404);
});
test("missing critical asset fails closed rather than silently mixing app versions",async()=>{
  const mock={RS_ASSETS:{get:async()=>null}};
  const r=await worker.fetch(new Request("https://preview.example/assets/rider-spot-"+RELEASE_HASH+"/app.mjs"),mock);
  assert.equal(r.status,503);
});
