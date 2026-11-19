import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("a service worker update never forces takeover of an active ride page", () => {
  const source = readFileSync(new URL("../legacy/sw.js", import.meta.url), "utf8");
  assert.equal(source.includes("self.skipWaiting("), false);
  assert.equal(source.includes("self.clients.claim("), false);
  assert.equal(source.includes("event.request.mode==='navigate'"), true);
  assert.equal(source.includes("fetch(event.request).catch"), true);
  assert.equal(source.includes("caches.open(CACHE)"), true);
});
