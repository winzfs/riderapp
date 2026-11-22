const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname,"../src/auto-income-time-list.js"),"utf8");

function install(){
  const window={addEventListener(){},removeEventListener(){}};
  const document={addEventListener(){},removeEventListener(){},visibilityState:"visible"};
  vm.runInNewContext(src,{window,document,Intl,Date,Number,Object,Set,String,Array,Math}, {timeout:1000});
  return {window,document};
}
test("KST 03:00 workday boundary is preserved for captured timestamp records",()=>{
  const u=install().window.__rsAutoIncomeTimeUtils;
  assert.equal(u.koreaWorkDay(Date.parse("2026-11-22T17:59:59.000Z")),"2026-11-22");
  assert.equal(u.koreaWorkDay(Date.parse("2026-11-22T18:00:00.000Z")),"2026-11-23");
  assert.equal(u.koreaWorkDay(Date.parse("2026-11-22T12:35:00.000Z")),"2026-11-22");
});
test("Invalid or missing capture timestamps stay missing and are never guessed",()=>{
  const u=install().window.__rsAutoIncomeTimeUtils;
  assert.equal(u.validDate(null),null);
  assert.equal(u.validDate(""),null);
  assert.equal(u.validDate("invalid"),null);
  assert.equal(u.validDate("2026-11-22T12:35:15Z").toISOString(),"2026-11-22T12:35:15.000Z");
});
test("Income timestamps use a read-only RLS query and never mutate income or navigation",()=>{
  assert.match(src,/\.from\("rider_auto_deliveries"\)/);
  assert.match(src,/\.select\("capture_id,captured_at,created_at,work_date,platform/);
  assert.match(src,/\.eq\("user_id",userId\)/);
  assert.match(src,/\.order\("captured_at",\{ascending:false\}\)/);
  assert.match(src,/\.limit\(80\)/);
  assert.doesNotMatch(src,/\.upsert\(|\.insert\(|\.update\(|\.delete\(|location\.reload\(|history\.replaceState\(/);
  assert.match(src,/status==="rejected"/);
});
test("View exposes readable capture time and optional delayed server sync time",()=>{
  assert.match(src,/second: "2-digit"/);
  assert.match(src,/capturedClock\.format\(at\)/);
  assert.match(src,/delay>30000\?" · 서버 저장 "/);
  assert.match(src,/needs_review: "중복 확인 필요 · 합산 전"/);
  assert.match(src,/React\.createElement/);
});
