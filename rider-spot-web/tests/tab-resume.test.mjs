import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const script = readFileSync(new URL("../src/tab-resume.js", import.meta.url), "utf8");
const KEY = "rs:ui:selected-tab-v54";

function mount(storage, initial = "nearby") {
  const listeners = new Map();
  const calls = [];
  const window = {
    __rsActiveTab: initial,
    addEventListener(type, fn) { listeners.set(type, fn); },
  };
  const localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
  };
  runInNewContext(script, {
    window, localStorage,
    setInterval() { throw new Error("tab resume must not install a repair timer"); },
  });
  window.__rsGoToTab = next => { calls.push(next); window.__rsActiveTab = next; };
  return {
    window, calls, listeners,
    navigate: next => { window.__rsGoToTab(next); },
    restore: tab => listeners.get("riderspot:tab-restored")({ detail: tab }),
  };
}

test("stale saved community tab never forces a new navigation", () => {
  const storage = new Map([[KEY, "community"]]);
  const app = mount(storage, "nearby");
  assert.equal(app.window.__rsTabResumeState().active, "nearby");
  assert.equal(app.calls.length, 0);
  assert.equal(app.window.__rsTabResumeState().repairs, 0);
});

test("a real user tab navigation can be remembered without a repair loop", () => {
  const storage = new Map();
  const app = mount(storage);
  app.navigate("bike");
  app.restore("bike");
  assert.equal(storage.get(KEY), "bike");
  app.window.__rsActiveTab = "trips";
  assert.equal(app.window.__rsTabResumeState().active, "trips");
  assert.equal(app.calls.length, 1);
});

test("restored events reject invalid tabs and never call navigation APIs", () => {
  const storage = new Map([[KEY, "nearby"]]);
  const app = mount(storage);
  app.restore("bad-tab");
  app.restore("community");
  assert.equal(storage.get(KEY), "community");
  assert.equal(app.calls.length, 0);
});
