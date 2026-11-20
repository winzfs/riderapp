import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import worker, { backendRequest, serveShell } from "../edge/static-edge.mjs";

const config = JSON.parse(readFileSync(new URL("../wrangler.static-preview.json", import.meta.url), "utf8"));
const guard = '<script id="rs-recovery-guard-v217">window.__rsGuard=true;</script>';
const requests = [];
function createEnv(withGuard = true) {
  return {
    ASSETS: {
      async fetch(request) {
        requests.push(["assets", new URL(request.url).pathname]);
        if (new URL(request.url).pathname === "/sw.js") {
          return new Response("const CACHE='safe';", { headers: { "content-type": "application/javascript" } });
        }
        if (/^\/assets\/rider-spot-[0-9a-f]{12}\//.test(new URL(request.url).pathname) && !new URL(request.url).pathname.includes("16c1eecf6bac")) {
          return new Response("Not found", { status: 404 });
        }
        return new Response('<html><head><title>Rider Spot</title></head><body>v221</body></html>', {
          headers: { "content-type": "text/html" },
        });
      },
    },
    LEGACY: {
      async fetch(request) {
        requests.push(["legacy", request.url, request.method]);
        if (new URL(request.url).pathname === "/") {
          return new Response('<html><head>' + (withGuard ? guard : "") + '</head></html>');
        }
        return new Response("legacy:" + new URL(request.url).pathname, { status: 200 });
      },
    },
  };
}
test("static assets binding is isolated from production and missing URLs fall back to legacy", () => {
  assert.equal(config.name, "rider-spot-static-preview");
  assert.equal(config.assets.directory, "./dist");
  assert.equal(config.assets.binding, "ASSETS");
  assert.ok(config.assets.run_worker_first.includes("/api/*"));
  assert.ok(config.assets.run_worker_first.includes("/"));
  assert.equal(config.services[0].service, "rider-spot-api-core-qa");
  assert.notEqual(config.services[0].service, "rider-spot");
});
test("shell includes the current production native guard exactly once", async () => {
  requests.length = 0;
  const r = await serveShell(new Request("https://rider-spot-static-preview.jazzhjm.workers.dev/"), createEnv());
  assert.equal(r.status, 200);
  assert.match(await r.text(), /rs-recovery-guard-v217/);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(requests.map(x => x[0]), ["assets", "legacy"]);
});
test("native OAuth callback nonce at root reaches backend, not the new shell", async () => {
  const nonce = "a".repeat(32);
  const calls = [];
  const env = {
    ASSETS: { async fetch() { throw Error("OAuth callback must not load assets"); } },
    LEGACY: { async fetch(req) {
      calls.push(req);
      return new Response("<html>native oauth return</html>", {
        headers: {
          "set-cookie": "rs_android_oauth=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax",
          "content-security-policy": "default-src 'none'",
          "cache-control": "no-store"
        }
      });
    }}
  };
  const req = new Request("https://rider-spot-static-preview.jazzhjm.workers.dev/?from=oauth", {
    headers: {cookie: "preferences=dark; rs_android_oauth="+nonce, accept: "text/html"}
  });
  const res = await worker.fetch(req, env);
  assert.equal(await res.text(), "<html>native oauth return</html>");
  assert.equal(res.headers.get("set-cookie")?.startsWith("rs_android_oauth=;"), true);
  assert.equal(res.headers.get("content-security-policy"), "default-src 'none'");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://rider-spot.jazzhjm.workers.dev/?from=oauth");
  assert.equal(calls[0].headers.get("cookie"), "preferences=dark; rs_android_oauth="+nonce);
});

test("normal or malformed OAuth cookie never bypasses guarded preview shell", async () => {
  for (const cookie of ["", "rs_android_oauth=not-valid", "other=rs_android_oauth="+"a".repeat(32)]) {
    requests.length = 0;
    const req = new Request("https://rider-spot-static-preview.jazzhjm.workers.dev/",
      { headers: cookie ? {cookie} : {} });
    const res = await worker.fetch(req, createEnv());
    assert.equal(res.status, 200);
    assert.match(await res.text(), /rs-recovery-guard-v217/);
    assert.deepEqual(requests.map(x=>x[0]), ["assets", "legacy"]);
  }
});

test("missing native recovery guard fails closed; do not serve a broken new UI", async () => {
  const r = await serveShell(new Request("https://rider-spot-static-preview.jazzhjm.workers.dev/"), createEnv(false));
  assert.equal(r.status, 503);
  assert.match(await r.text(), /guard missing/);
});
test("new KV shell outage fails over to the verified v220 shell instead of a blank page", async () => {
  requests.length=0;
  const env=createEnv();
  env.ASSETS.fetch=async()=>new Response("temporary KV outage",{status:503});
  const res=await worker.fetch(new Request("https://rider-spot-static-preview.jazzhjm.workers.dev/"),env);
  assert.equal(res.status,200);
  assert.equal(res.headers.get("x-rs-fallback"),"v220");
  assert.equal(res.headers.get("cache-control"),"no-store");
  const html=await res.text();
  assert.match(html,/rs-recovery-guard-v217/);
  assert.ok(!html.includes("v221"));
  assert.deepEqual(requests.map(x=>x[0]),["legacy"]);
});

test("invalid candidate HTML fails over and HEAD fallback remains bodyless", async () => {
  const env=createEnv();
  env.ASSETS.fetch=async()=>new Response("<html>bad shell</html>");
  const get=await worker.fetch(new Request("https://rider-spot-static-preview.jazzhjm.workers.dev/"),env);
  assert.equal(get.status,200);
  assert.equal(get.headers.get("x-rs-fallback"),"v220");
  const head=await worker.fetch(new Request("https://rider-spot-static-preview.jazzhjm.workers.dev/",{method:"HEAD"}),env);
  assert.equal(head.status,200);
  assert.equal(head.headers.get("x-rs-fallback"),"v220");
  assert.equal(await head.text(),"");
});

test("both candidate and original app failures stop safely", async () => {
  const env=createEnv();
  env.ASSETS.fetch=async()=>new Response("temporary KV outage",{status:503});
  env.LEGACY.fetch=async()=>new Response("upstream unavailable",{status:503});
  const res=await worker.fetch(new Request("https://rider-spot-static-preview.jazzhjm.workers.dev/"),env);
  assert.equal(res.status,503);
  assert.match(await res.text(),/fallback unavailable/);
});

test("all API methods and query strings are forwarded without asset interception", async () => {
  requests.length = 0;
  const req = new Request("https://rider-spot-static-preview.jazzhjm.workers.dev/api/trips?date=2026-11-19", {
    method: "POST", headers: { "x-test": "preserved" }, body: '{"value":1}',
  });
  const env = createEnv();
  const r = await worker.fetch(req, env);
  assert.equal(await r.text(), "legacy:/api/trips");
  assert.deepEqual(requests.map(x => x[0]), ["legacy"]);
  assert.equal(requests[0][1], "https://rider-spot.jazzhjm.workers.dev/api/trips?date=2026-11-19");
  assert.equal(requests[0][2], "POST");
  const forwarded = backendRequest(req);
  assert.equal(forwarded.headers.get("x-test"), "preserved");
  assert.equal(await forwarded.text(), '{"value":1}');
});
test("old CSS and JS requests stay on legacy backend", async () => {
  const env = createEnv();
  for (const path of ["/rider-spot-shell-v40.js", "/rider-maintenance-v40-teal-defaults.js"]) {
    const r = await worker.fetch(new Request("https://preview.example" + path), env);
    assert.equal(await r.text(), "legacy:" + path);
  }
});
test("service-worker updates remain no-cache without skipping the native safeguard", async () => {
  const r = await worker.fetch(new Request("https://preview.example/sw.js"), createEnv());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-cache, must-revalidate");
  assert.match(await r.text(), /const CACHE/);
});

test("current release asset requests use the isolated asset service", async () => {
  requests.length=0;
  const path="/assets/rider-spot-16c1eecf6bac/premium-shell.css";
  const r=await worker.fetch(new Request("https://preview.example"+path),createEnv());
  assert.equal(r.status,200);
  assert.deepEqual(requests.map(x=>x[0]),["assets"]);
});
test("old hashed releases still fall back to the existing backend Worker", async () => {
  requests.length=0;
  const path="/assets/rider-spot-06a4d2f6010a/premium-shell.css";
  const r=await worker.fetch(new Request("https://preview.example"+path),createEnv());
  assert.equal(await r.text(),"legacy:"+path);
  assert.deepEqual(requests.map(x=>x[0]),["assets","legacy"]);
});


test("visual refresh CSS link is inserted after existing styles and preserves one native guard",async()=>{
  const env=createEnv();
  const original=env.ASSETS.fetch;
  env.ASSETS.fetch=async(req)=>{
    const response=await original(req);
    return new Response('<html><head><link rel="stylesheet" href="/assets/rider-spot-16c1eecf6bac/premium-shell.css"></head><body>v221</body></html>',{headers:response.headers});
  };
  const res=await worker.fetch(new Request("https://rider-spot-static-preview.jazzhjm.workers.dev/"),env);
  assert.equal(res.status,200);
  const html=await res.text();
  const premium=html.indexOf("premium-shell.css");
  const visual=html.indexOf("rider-spot-visual-v2-20261121.css");
  assert.ok(premium>=0&&visual>premium,"visual layer must load last");
  assert.equal((html.match(/rider-spot-visual-v2-20261121.css/g)||[]).length,1);
  assert.equal((html.match(/id="rs-recovery-guard-v217"/g)||[]).length,1);
});
test("visual CSS request is dispatched only to isolated design Worker",async()=>{
  const env=createEnv();
  let calls=0;
  env.DESIGN={async fetch(req){calls++;return new Response("/* v2 */",{headers:{"content-type":"text/css"}})}};
  const req=new Request("https://rider-spot-static-preview.jazzhjm.workers.dev/rider-spot-visual-v2-20261121.css");
  const res=await worker.fetch(req,env);
  assert.equal(res.status,200);
  assert.equal(res.headers.get("content-type"),"text/css");
  assert.equal(await res.text(),"/* v2 */");
  assert.equal(calls,1);
});
