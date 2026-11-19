import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("map reports boot watches meaningful mount events instead of polling the entire document",()=>{
 const source=readFileSync(new URL("../src/map-reports.js",import.meta.url),"utf8");
 const boot=source.slice(source.lastIndexOf("  function boot()"));
 assert.ok(boot.includes('node.matches?.(selector) || node.querySelector?.(selector)'));
 assert.ok(boot.includes('queueMicrotask(() => {'));
 assert.ok(boot.includes('if (RS.client) { clearInterval(retry); return; }'));
 assert.ok(!boot.includes('}, 900);'));
 assert.ok(source.includes('window.addEventListener("riderspot:map",'));
});
