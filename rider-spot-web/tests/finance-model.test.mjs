import test from "node:test";
import assert from "node:assert/strict";
import {koreanWorkDay,plusDays,financeTotals,financeDays,financePeriod,monthLastDay} from "../src/finance-model.mjs";

test("Seoul accounting date rolls over at 03:00, not midnight",()=>{
  assert.equal(koreanWorkDay(new Date("2026-11-18T17:59:59Z")),"2026-11-18");
  assert.equal(koreanWorkDay(new Date("2026-11-18T18:00:00Z")),"2026-11-19");
  // 02:59 KST Nov 19 = Nov 18 UTC 17:59; period belongs Nov 18.
  assert.equal(koreanWorkDay(new Date("2026-11-18T17:59:59Z")),"2026-11-18");
  // 03:00 KST on Nov 19.
  assert.equal(koreanWorkDay(new Date("2026-11-18T18:00:00Z")),"2026-11-19");
  assert.equal(koreanWorkDay(new Date("2026-12-31T16:30:00Z")),"2026-12-31");
});
test("work periods cross months correctly",()=>{
  assert.deepEqual(financePeriod("2026-11-19","today"),["2026-11-19","2026-11-19"]);
  assert.deepEqual(financePeriod("2026-11-19","week"),["2026-11-13","2026-11-19"]);
  assert.deepEqual(financePeriod("2026-11-19","month"),["2026-11-01","2026-11-30"]);
  assert.equal(monthLastDay("2028-02-12"),"2028-02-29");
  assert.equal(plusDays("2026-12-31",1),"2027-01-01");
});
test("expense categories are disjoint, and paid status is not revenue twice",()=>{
 const data={
 earnings:[
  {work_date:"2026-11-19",platform:"쿠팡이츠",gross_won:120000,expenses_won:3000,expense_scope:"other_only",paid_at:"2026-11-20",gross_entered:true,deliveries:12},
  {work_date:"2026-11-19",platform:"배민",gross_won:40000,expenses_won:0,expense_scope:"other_only",paid_at:null,gross_entered:true,deliveries:4},
  {work_date:"2026-11-19",platform:"배민",gross_won:9999999,gross_entered:false}
 ],
 fuel:[{fueled_on:"2026-11-19",cost_won:8000}],
 maintenance:[{serviced_on:"2026-11-19",cost_won:22000}],
 extras:[{expense_date:"2026-11-19",category:"식비",amount_won:7000}]
 };
 const x=financeTotals(data,"2026-11-19","2026-11-19");
 assert.equal(x.gross,160000);
 assert.equal(x.cost,40000);
 assert.equal(x.net,120000);
 assert.equal(x.paid,120000);assert.equal(x.unpaid,40000);
 assert.deepEqual(x.byPlatform,{"쿠팡이츠":120000,"배민":40000});
 assert.equal(x.deliveries,16);
 assert.equal(x.uncertain,false);
 assert.equal(financeDays(data,"2026-11-19",7).at(-1).gross,160000);
});
test("legacy unknown cost scope is flagged instead of claiming reliable net",()=>{
 const x=financeTotals({earnings:[{work_date:"2026-11-18",gross_won:10000,expenses_won:2000,expense_scope:"legacy_unknown"}]},"2026-11-18","2026-11-18");
 assert.equal(x.uncertain,true);assert.equal(x.net,8000);
});
