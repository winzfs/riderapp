import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import visual, {DESIGN_PATH} from "../edge/visual-v2-worker.mjs";

test("new visual stylesheet is a dedicated static asset with no backend access",async()=>{
  const css=readFileSync(new URL("../src/visual-v2.css",import.meta.url),"utf8");
  const res=await visual.fetch(new Request("https://rider-spot-static-preview.jazzhjm.workers.dev"+DESIGN_PATH));
  assert.equal(res.status,200);
  assert.equal(res.headers.get("content-type"),"text/css; charset=utf-8");
  assert.equal(res.headers.get("x-rs-design"),"visual-v2-20261121");
  assert.equal(await res.text(),css);
  assert.ok(css.includes(".finance-page .fin-hero"));
  assert.ok(css.includes(".bike-page .bike-vehicle"));
  assert.ok(css.includes(".bottom-nav button.active"));
  for(const token of ["navigator.geolocation","localStorage.clear(","location.reload(","window.location.assign("]){
    assert.ok(!css.includes(token),"visual layer must never change runtime state");
  }
});
test("visual asset only serves GET/HEAD on its own path",async()=>{
  const base="https://rider-spot-static-preview.jazzhjm.workers.dev";
  const miss=await visual.fetch(new Request(base+"/api/weather"));
  assert.equal(miss.status,404);
  const post=await visual.fetch(new Request(base+DESIGN_PATH,{method:"POST"}));
  assert.equal(post.status,405);
  const head=await visual.fetch(new Request(base+DESIGN_PATH,{method:"HEAD"}));
  assert.equal(head.status,200);
  assert.equal(await head.text(),"");
});
