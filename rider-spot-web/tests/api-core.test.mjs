import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../edge/api-core.mjs";

const origin = "https://rider-spot.jazzhjm.workers.dev";
const withLegacy = () => {
  const calls = [];
  return {
    calls,
    env: {
      LEGACY_BACKEND: {
        async fetch(request) {
          calls.push(request);
          return new Response("original:" + new URL(request.url).pathname, {
            headers: {"x-rs-backend": "legacy"}
          });
        }
      }
    }
  };
};

test("extracted API core is small and does not embed 56MB static bundles", () => {
  const source = readFileSync(new URL("../edge/api-core.mjs", import.meta.url), "utf8");
  assert.ok(source.length < 25000, "unexpected API core size");
  assert.ok(!source.includes("const rsNewAssets="));
  assert.ok(!source.includes("Object.assign(files,"));
  for (const handler of ["handleRiderSpotOAuth", "riderSpotMatchRoads", "getIndustryNews", "rsHandleWeather"])
    assert.ok(source.includes("function " + handler), "missing original handler "+handler);
});

test("unknown and historic asset URLs preserve method, query, cookie, and body", async () => {
  const {env,calls} = withLegacy();
  const input = new Request(origin + "/old-asset.js?cache=off", {
    method:"POST", headers:{cookie:"oldsession=abc", "content-type":"text/plain"}, body:"hello"
  });
  const response = await worker.fetch(input, env);
  assert.equal(await response.text(), "original:/old-asset.js");
  assert.equal(response.headers.get("x-rs-backend"), "legacy");
  assert.equal(calls.length,1);
  assert.equal(calls[0].url, origin+"/old-asset.js?cache=off");
  assert.equal(calls[0].method,"POST");
  assert.equal(calls[0].headers.get("cookie"),"oldsession=abc");
  assert.equal(await calls[0].text(),"hello");
});

test("Android OAuth nonce start returns original redirect and secure cookie", async () => {
  const {env,calls} = withLegacy();
  const nonce="a".repeat(32);
  const target="https://qkcqzhkvfbymzjdktshp.supabase.co/auth/v1/authorize?provider=google&redirect_to="+encodeURIComponent(origin+"/");
  const req=new Request(origin+"/__rs_android_oauth_start?state="+nonce+"&target="+encodeURIComponent(target));
  const response=await worker.fetch(req,env);
  assert.equal(response.status,302);
  assert.equal(response.headers.get("location"),target);
  assert.match(response.headers.get("set-cookie")||"", /rs_android_oauth=a{32}; Max-Age=600; Path=\/; Secure; HttpOnly; SameSite=Lax/);
  assert.equal(response.headers.get("cache-control"),"no-store");
  assert.equal(calls.length,0);
});

test("Android login callback at root retains cookie-clearing HTML and CSP", async () => {
  const {env,calls}=withLegacy();
  const nonce="b".repeat(32);
  const response=await worker.fetch(new Request(origin+"/",{headers:{cookie:"rs_android_oauth="+nonce}}),env);
  assert.equal(response.status,200);
  const html=await response.text();
  assert.ok(html.includes("riderspot-oauth://signin/callback"));
  assert.ok(html.includes("encodeURIComponent(state)"));
  assert.match(response.headers.get("set-cookie")||"", /Max-Age=0/);
  assert.match(response.headers.get("content-security-policy")||"", /default-src 'none'/);
  assert.equal(calls.length,0);
});

test("invalid Android OAuth requests cannot redirect to arbitrary origins", async () => {
  const {env,calls}=withLegacy();
  const url=origin+"/__rs_android_oauth_start?state="+"a".repeat(32)+"&target="+encodeURIComponent("https://evil.example/auth/v1/authorize?provider=google");
  const response=await worker.fetch(new Request(url),env);
  assert.equal(response.status,400);
  assert.equal(calls.length,0);
});

test("weather method and coordinate validation are preserved", async () => {
  const {env,calls}=withLegacy();
  const invalid=await worker.fetch(new Request(origin+"/api/weather?lat=0&lon=0"),env);
  assert.equal(invalid.status,400);
  assert.equal((await invalid.json()).error,"유효한 국내 위치가 필요합니다.");
  const method=await worker.fetch(new Request(origin+"/api/weather?lat=35.17&lon=126.83",{method:"POST"}),env);
  assert.equal(method.status,405);
  assert.equal(calls.length,0);
});

test("road matching validates methods, origin, body without calling external OSRM", async () => {
  const {env,calls}=withLegacy();
  const method=await worker.fetch(new Request(origin+"/api/route-match"),env);
  assert.equal(method.status,405);
  const invalid=await worker.fetch(new Request(origin+"/api/route-match",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({points:[]})
  }),env);
  assert.equal(invalid.status,400);
  const crossOrigin=await worker.fetch(new Request(origin+"/api/route-match",{
    method:"POST",headers:{"origin":"https://untrusted.example","content-type":"application/json"},body:JSON.stringify({points:[]})
  }),env);
  assert.equal(crossOrigin.status,403);
  assert.equal(calls.length,0);
});

test("news API preserves JSON output when upstream is unavailable", async () => {
  const {env,calls}=withLegacy();
  const before=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error("simulated outage")};
  try {
    const response=await worker.fetch(new Request(origin+"/api/industry-news"),env);
    assert.equal(response.status,502);
    const json=await response.json();
    assert.deepEqual(json.items,[]);
    assert.equal(typeof json.message,"string");
  } finally {globalThis.fetch=before;}
  assert.equal(calls.length,0);
});
