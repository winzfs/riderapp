import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("a service worker update never forces takeover of an active ride page", () => {
  const source = readFileSync(new URL("../legacy/sw.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /self\\.skipWaiting\\s*\\(/);
  assert.doesNotMatch(source, /self\\.clients\\.claim\\s*\\(/);
  assert.match(source, /event\\.request\\.mode==='navigate'/);
  assert.match(source, /fetch\\(event\\.request\\)\\.catch/);
  assert.match(source, /caches\\.open\\(CACHE\\)/);
});
