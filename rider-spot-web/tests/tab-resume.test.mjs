import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const script = readFileSync(new URL("../src/tab-resume.js", import.meta.url), "utf8");
const KEY = "rs:ui:selected-tab-v54";
const LABELS = {
  nearby: "지도",
  trips: "타임라인",
  tools: "업무",
  community: "커뮤니티",
  account: "내 정보",
};

function mount(storage, selected = "nearby") {
  const nowBase = Date.now();
  let now = nowBase;
  let active = selected;
  let tick;
  const calls = [];
  const listeners = new Map();
  const mockStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
  };
  const document = {
    hidden: false,
    addEventListener(type, handler) { listeners.set(type, handler); },
    querySelector(selector) {
      if (selector === "nav.bottom-nav") return {};
      if (selector === "nav.bottom-nav button[aria-current='page']") {
        return { querySelector() { return { textContent: LABELS[active] }; } };
      }
      return null;
    },
  };
  const window = {
    addEventListener() {},
    __rsOpenTool(tool) { calls.push("open:" + tool); },
  };
  class Clock extends Date {
    static now() { return now; }
  }
  runInNewContext(script, {
    window, document, localStorage: mockStorage,
    setInterval(callback) { tick = callback; }, Date: Clock,
  });
  window.__rsGoToTab = (tab) => { active = tab; calls.push(tab); };
  return {
    window, listeners, calls,
    get active() { return active; },
    setActive(tab) { active = tab; },
    advance(ms) { now = nowBase + ms; tick(); },
  };
}

test("native reload restores timeline without clearing saved GPS data", () => {
  const storage = new Map([["rs:trips:guest", '[{"id":"unchanged"}]']]);
  const first = mount(storage);
  assert.equal(first.active, "nearby");
  first.listeners.get("pointerdown")({
    target: {
      nodeType: 1,
      closest(selector) {
        return selector === "nav.bottom-nav button"
          ? { querySelector() { return { textContent: "타임라인" }; } }
          : null;
      },
    },
  });
  assert.equal(storage.get(KEY), "trips");
  const second = mount(storage);
  second.advance(900);
  assert.equal(second.active, "trips");
  assert.equal(storage.get("rs:trips:guest"), '[{"id":"unchanged"}]');
});

test("navigation by the app API is also remembered", () => {
  const storage = new Map();
  const app = mount(storage);
  app.window.__rsGoToTab("community");
  assert.equal(storage.get(KEY), "community");
  const resumed = mount(storage);
  resumed.advance(900);
  assert.equal(resumed.active, "community");
  resumed.window.__rsGoToTab("nearby");
  assert.equal(storage.get(KEY), "nearby");
});

test("tools opens its hub rather than a blank React tab", () => {
  const app = mount(new Map([[KEY, "tools"]]));
  app.advance(900);
  assert.deepEqual(app.calls, ["open:hub"]);
  assert.equal(app.active, "nearby");
});

test("limits repeated recovery when a destination crashes", () => {
  const app = mount(new Map([[KEY, "trips"]]));
  for (let index = 0; index < 7; index++) {
    app.setActive("nearby");
    app.advance(900 + index * 1400);
  }
  assert.equal(app.calls.filter((tab) => tab === "trips").length, 3);
});
