import test from "node:test";
import assert from "node:assert/strict";
import { createNavigationController } from "../src/navigation.mjs";

function harness() {
  const handlers = new Map();
  const events = [];
  const stack = [{}];
  let position = 0;
  const host = {
    location: { href: "https://example.test/" },
    CustomEvent: class {
      constructor(type, options) { this.type = type; this.detail = options?.detail; }
    },
    addEventListener(type, fn) {
      handlers.set(type, [...(handlers.get(type) || []), fn]);
    },
    removeEventListener(type, fn) {
      handlers.set(type, (handlers.get(type) || []).filter(f => f !== fn));
    },
    dispatchEvent(event) {
      events.push(event);
      for (const fn of handlers.get(event.type) || []) fn(event);
    },
    history: {
      get state() { return stack[position]; },
      get length() { return stack.length; },
      replaceState(value) { stack[position] = value; },
      pushState(value) { stack.splice(position + 1); stack.push(value); position++; },
      back() {
        if (position > 0) {
          position--;
          host.dispatchEvent({ type: "popstate", state: stack[position] });
        }
      },
    },
  };
  return { host, events, stack, get position() { return position; } };
}

test("switching tabs does not create history and Back never changes a tab", () => {
  const h = harness(), nav = createNavigationController(h.host), shown = [];
  nav.subscribe(tab => shown.push(tab));
  const baseline = h.host.history.length;
  nav.goTab("bike");
  nav.goTab("community");
  nav.goTab("trips");
  assert.equal(h.host.history.length, baseline);
  assert.equal(nav.tab, "trips");
  assert.equal(nav.back(), true);
  assert.equal(nav.tab, "trips");
  assert.equal(h.events.filter(e => e.type === "riderspot:root-back").length, 1);
  assert.equal(nav.back(), false);
  assert.equal(h.events.filter(e => e.type === "riderspot:exit-request").length, 1);
  assert.deepEqual(shown, ["nearby", "bike", "community", "trips"]);
  nav.destroy();
});

test("nested overlays close one by one and then require two more Back presses", () => {
  const h = harness(), nav = createNavigationController(h.host), closed = [];
  nav.subscribe(() => {});
  nav.goTab("bike");
  let parentRelease, childRelease;
  parentRelease = nav.registerLayer("bike-detail", () => { closed.push("detail"); parentRelease(); });
  childRelease = nav.registerLayer("bike-editor", () => { closed.push("editor"); childRelease(); });
  nav.back(); assert.deepEqual(closed, ["editor"]);
  assert.equal(nav.tab, "bike");
  nav.back(); assert.deepEqual(closed, ["editor", "detail"]);
  assert.equal(h.events.filter(e => e.type === "riderspot:root-back").length, 0);
  assert.equal(nav.back(), true);
  assert.equal(nav.back(), false);
  assert.equal(h.events.filter(e => e.type === "riderspot:exit-request").length, 1);
  nav.destroy();
});

test("closing a sheet by its X consumes marker without triggering exit prompt", () => {
  const h = harness(), nav = createNavigationController(h.host);
  nav.subscribe(() => {});
  nav.goTab("bike");
  const release = nav.registerLayer("maintenance", () => {});
  release();
  assert.equal(nav.tab, "bike");
  assert.equal(nav.depth, 0);
  assert.equal(h.events.filter(e => e.type === "riderspot:root-back").length, 0);
  nav.back();
  assert.equal(h.events.filter(e => e.type === "riderspot:root-back").length, 1);
  nav.destroy();
});

test("browser back does not restore old tab from history and double Back exits", () => {
  const h = harness(), nav = createNavigationController(h.host);
  nav.subscribe(() => {});
  nav.goTab("community");
  // Browser/Android back pops the root guard, which is immediately restored.
  h.host.history.back();
  assert.equal(nav.tab, "community");
  assert.equal(h.events.filter(e => e.type === "riderspot:root-back").length, 1);
  h.host.history.back();
  assert.equal(h.events.filter(e => e.type === "riderspot:exit-request").length, 1);
  nav.destroy();
});

test("invalid tabs and repeated clicks cannot create phantom history", () => {
  const h = harness(), nav = createNavigationController(h.host);
  const before = h.host.history.length;
  assert.equal(nav.goTab("nearby"), false);
  assert.equal(nav.goTab("unknown"), false);
  assert.equal(h.host.history.length, before);
  nav.destroy();
});

test("blocked sheet save keeps layer open instead of counting an exit press", () => {
  const h = harness(), nav = createNavigationController(h.host);
  nav.subscribe(() => {});
  const release = nav.registerLayer("save-in-progress", () => false);
  nav.back();
  assert.equal(nav.depth, 1);
  assert.equal(h.events.filter(e => e.type === "riderspot:root-back").length, 0);
  release();
  nav.destroy();
});
