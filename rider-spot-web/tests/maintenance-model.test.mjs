import test from "node:test";
import assert from "node:assert/strict";
import {standardParts, normalizePart, itemsOf, composeServiceItems, serviceRows, serviceDue, totalMaintenanceCost} from "../src/maintenance-model.mjs";

test("show six rider-priority default parts in the 3-by-2 dashboard without adding every icon", () => {
  assert.deepEqual(standardParts, ["엔진오일","앞 타이어","뒤 타이어","브레이크 패드","구동벨트","에어필터"]);
});
test("split only legacy composite records; keep independent service_items", () => {
  assert.deepEqual(itemsOf({item:"앞 타이어 · 뒤 타이어"}),["앞 타이어","뒤 타이어"]);
  assert.deepEqual(itemsOf({item:"복합 교체",service_items:["앞 타이어","뒤 타이어"]}),["앞 타이어","뒤 타이어"]);
  assert.deepEqual(itemsOf({item:"체인"}),["체인"]);
});
test("multi-select + custom remains one record, selection removal and dedupe work", () => {
  assert.deepEqual(composeServiceItems(["앞 타이어","뒤 타이어","앞 타이어"]," 에어필터 "),["앞 타이어","뒤 타이어","에어필터"]);
  assert.deepEqual(composeServiceItems(["엔진오일"]," 엔진오일 "),["엔진오일"]);
  assert.equal(normalizePart("  앞　 타이어 "),"앞 타이어");
  assert.throws(()=>composeServiceItems([],""),/정비 항목/);
  assert.throws(()=>composeServiceItems([],"A"),/2~40/);
  assert.throws(()=>composeServiceItems(["긴".repeat(41)]),/40자/);
});
test("part histories match both tires independently without duplicating records", () => {
  const rows=[
    {id:"a",serviced_on:"2026-11-14",item:"앞 타이어 · 뒤 타이어",service_items:["앞 타이어","뒤 타이어"],cost_won:140000},
    {id:"b",serviced_on:"2026-10-14",item:"앞 타이어",service_items:["앞 타이어"],cost_won:0},
  ];
  assert.deepEqual(serviceRows(rows,"앞 타이어").map(x=>x.id),["a","b"]);
  assert.deepEqual(serviceRows(rows,"뒤 타이어").map(x=>x.id),["a"]);
  assert.equal(totalMaintenanceCost(rows),140000);
  assert.equal(totalMaintenanceCost([rows[0],rows[0],rows[1]]),140000);
  assert.equal(rows[1].cost_won,0);
});
test("cost null and zero remain distinct, and missing distances are never fabricated",()=>{
  const rows=[{id:"a",cost_won:null},{id:"b",cost_won:0},{id:"c",cost_won:40000}];
  assert.equal(totalMaintenanceCost(rows),40000);
  assert.equal(serviceDue(null,null,30000).next,null);
  assert.equal(serviceDue({odometer_km:null},{interval_km:4000},28000).next,null);
});
test("service due obeys configured km and old explicit next_due",()=>{
  const cycle={interval_km:4000};
  const row={odometer_km:24500,next_due_km:null};
  assert.deepEqual(serviceDue(row,cycle,25700),{next:28500,remaining:2800,state:"ok",threshold:400});
  assert.equal(serviceDue(row,cycle,28300).state,"soon");
  assert.equal(serviceDue(row,cycle,28600).state,"overdue");
  assert.equal(serviceDue({odometer_km:24500,next_due_km:30000},cycle,25700).next,30000);
  assert.equal(serviceDue(row,cycle,null).state,"unknown");
});
test("same date service rows are sorted by created_at without mutating source",()=>{
  const rows=[{id:"older",serviced_on:"2026-11-11",created_at:"2026-11-11T10:00:00Z",item:"오일"},
    {id:"newer",serviced_on:"2026-11-11",created_at:"2026-11-11T12:00:00Z",item:"오일"}];
  assert.deepEqual(serviceRows(rows,"오일").map(r=>r.id),["newer","older"]);
  assert.equal(rows[0].id,"older");
});
