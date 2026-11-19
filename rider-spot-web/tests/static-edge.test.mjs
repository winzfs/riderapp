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
  assert.equal(config.services[0].service, "rider-spot");
});
test("shell includes the current production native guard exactly once", async () => {
  requests.length = 0;
  const r = await serveShell(new Request("https://rider-spot-static-preview.jazzhjm.workers.dev/"), createEnv());
  assert.equal(r.status, 200);
  assert.match(await r.text(), /rs-recovery-guard-v217/);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(requests.map(x => x[0]), ["assets", "legacy"]);
});
test("missing native recovery guard fails closed; do not serve a broken new UI", async () => {
  const r = await serveShell(new Request("https://rider-spot-static-preview.jazzhjm.workers.dev/"), createEnv(false));
  assert.equal(r.status, 503);
  assert.match(await r.text(), /guard missing/);
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
