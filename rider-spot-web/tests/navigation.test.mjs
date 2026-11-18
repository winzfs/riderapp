import test from "node:test";
import assert from "node:assert/strict";
import { createNavigationController } from "../src/navigation.mjs";
function harness() {
  const handlers = new Map();
  const events = [];
  const stack = [{},];
  let position = 0;
  const host = {
    location: { href: "https://example.test/" },
    CustomEvent: class {constructor(type, o) {this.type=type;this.detail=o?.detail;}},
    addEventListener(type, fn) { const arr=handlers.get(type)||[];arr.push(fn);handlers.set(type,arr); },
    removeEventListener(type, fn) {handlers.set(type,(handlers.get(type)||[]).filter(f=>f!==fn));},
    dispatchEvent(event) {events.push(event);for(const fn of handlers.get(event.type)||[])fn(event);},
    history: {
      get state() {return stack[position];},
      get length() {return stack.length;},
      replaceState(value) {stack[position]=value;},
      pushState(value) {stack.splice(position+1);stack.push(value);position++;},
      back() {if(position>0){position--;host.dispatchEvent({type:"popstate",state:stack[position]});}},
    },
  };
  return {host,events,stack,get position(){return position}};
}
test("tab back runs in visited order and guards the home screen", () => {
  const h=harness(),nav=createNavigationController(h.host),shown=[];
  nav.subscribe(tab=>shown.push(tab));
  nav.goTab("bike");nav.goTab("community");nav.goTab("trips");
  assert.equal(nav.tab,"trips");
  nav.back();assert.equal(nav.tab,"community");
  nav.back();assert.equal(nav.tab,"bike");
  nav.back();assert.equal(nav.tab,"nearby");
  nav.back();
  assert.equal(nav.tab,"nearby");
  assert.equal(h.events.filter(e=>e.type==="riderspot:root-back").length,1);
  nav.destroy();
});
test("nested overlays close one at a time before returning to previous tab", () => {
  const h=harness(),nav=createNavigationController(h.host),closed=[];
  nav.subscribe(()=>{});
  nav.goTab("bike");
  let releaseParent;
  releaseParent=nav.registerLayer("bike-detail",()=>{closed.push("detail");releaseParent();});
  let releaseChild;
  releaseChild=nav.registerLayer("bike-editor",()=>{closed.push("editor");releaseChild();});
  nav.back();assert.deepEqual(closed,["editor"]);assert.equal(nav.tab,"bike");
  nav.back();assert.deepEqual(closed,["editor","detail"]);assert.equal(nav.tab,"bike");
  nav.back();assert.equal(nav.tab,"nearby");
  nav.destroy();
});
test("closing a sheet normally consumes only its history entry", () => {
  const h=harness(),nav=createNavigationController(h.host);
  nav.subscribe(()=>{});nav.goTab("bike");
  const release=nav.registerLayer("maintenance",()=>{});
  release();assert.equal(nav.tab,"bike");
  nav.back();assert.equal(nav.tab,"nearby");
  nav.destroy();
});
test("invalid tab names and repeated tab clicks do not create phantom history", () => {
  const h=harness(),nav=createNavigationController(h.host);
  const before=h.host.history.length;
  assert.equal(nav.goTab("nearby"),false);assert.equal(nav.goTab("oops"),false);
  assert.equal(h.host.history.length,before);
  nav.destroy();
});
