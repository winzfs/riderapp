import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../legacy/sw.js", import.meta.url), "utf8");

test("a service worker update never forces takeover of an active ride page", () => {
  assert.doesNotMatch(source, /self\.(?:skipWaiting|clients\.claim)\s*\(/);
});

function navigate(network, cached = new Response("cached application")) {
  const listeners = new Map();
  const request = { method: "GET", url: "https://rider.test/", mode: "navigate" };
  let result;
  runInNewContext(source, {
    self: {
      location: { origin: "https://rider.test" },
      addEventListener: (type, handler) => listeners.set(type, handler),
    },
    caches: {
      async open(name) {
        assert.match(name, /^rider-spot-shell-/);
        return { match: async path => path === "/index.html" ? cached : undefined };
      },
    },
    fetch: network,
    Response,
    URL,
  });
  listeners.get("fetch")({
    request,
    respondWith(response) { result = response; },
  });
  return result;
}

test("navigation serves the installed shell through a Worker 503 or dropped connection", async () => {
  for (const network of [
    async () => new Response("unavailable", { status: 503 }),
    async () => { throw new Error("offline"); },
  ]) {
    assert.equal(await (await navigate(network)).text(), "cached application");
  }
});

test("navigation preserves healthy responses and explicit client errors", async () => {
  for (const status of [200, 401, 404]) {
    const response = new Response("network", { status });
    assert.equal(await navigate(async () => response), response);
  }
});

test("navigation preserves a Worker 503 when no application shell is installed", async () => {
  const response = new Response("unavailable", { status: 503 });
  assert.equal(await navigate(async () => response, null), response);
});
