import test from "node:test";
import assert from "node:assert/strict";
import {koreanWorkDay,koreanCalendarDay,plusDays,financeTotals,financeDays,financePeriod,monthLastDay,financeLedger,validWon,plannedExpenseDate,recurringOccurrences,nextPayoutDate,financeMonths,accountFinanceData} from "../src/finance-model.mjs";

test("Seoul accounting date rolls over at midnight across days and years",()=>{
  assert.equal(koreanWorkDay(new Date("2026-11-18T14:59:59Z")),"2026-11-18");
  assert.equal(koreanWorkDay(new Date("2026-11-18T15:00:00Z")),"2026-11-19");
  assert.equal(koreanWorkDay(new Date("2026-12-31T16:30:00Z")),"2027-01-01");
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
 assert.equal(x.cost,33000);
 assert.equal(x.net,127000);
 assert.equal(x.paid,120000);assert.equal(x.unpaid,40000);
 const adjusted=financeTotals({...data,earnings:data.earnings.map((r,i)=>i===0?{...r,paid_won:115000}:r)},"2026-11-19","2026-11-19");
 assert.equal(adjusted.paid,115000);assert.equal(adjusted.payoutDifference,-5000);assert.equal(adjusted.unpaid,40000);
 assert.deepEqual(x.byPlatform,{"쿠팡이츠":120000,"배민":40000});
 assert.equal(x.deliveries,16);
 assert.equal(x.uncertain,false);
 assert.equal(financeDays(data,"2026-11-19",7).at(-1).gross,160000);
});
test("legacy unknown cost scope is flagged instead of claiming reliable net",()=>{
 const x=financeTotals({earnings:[{work_date:"2026-11-18",gross_won:10000,expenses_won:2000,expense_scope:"legacy_unknown"}]},"2026-11-18","2026-11-18");
 assert.equal(x.uncertain,true);assert.equal(x.net,8000);
});

test("personal spending does not reduce business net, source ids remain intact",()=>{
  const data={earnings:[{id:"a",work_date:"2026-11-19",gross_won:120000}],
    fuel:[{id:"f",fueled_on:"2026-11-19",cost_won:8000}],
    maintenance:[{id:"m",serviced_on:"2026-11-19",cost_won:20000}],
    extras:[{id:"e",expense_date:"2026-11-19",category:"개인 비용",amount_won:4000},
      {id:"b",expense_date:"2026-11-19",category:"보험료",amount_won:5000}]};
  const totals=financeTotals(data,"2026-11-19","2026-11-19");
  assert.equal(totals.net,87000);assert.equal(totals.personalCost,4000);
  assert.equal(totals.totalSpent,37000);
  assert.deepEqual(new Set(financeLedger(data,"2026-11-19","2026-11-19").map(x=>x.row.id)),new Set(["a","f","m","e","b"]));
});
test("won amount validation rejects decimals and oversized values",()=>{
  assert.equal(validWon(12345),true);
  for(const value of [-1,0.2,1e12,Infinity,"NaN"])assert.equal(validWon(value),false);
});

test("recurring expenses are only projected until user confirms the actual payment",()=>{
  const rules=[{id:"rule-a",category:"보험료",amount_won:65000,day_of_month:31,active:true},
    {id:"rule-b",category:"통신비",amount_won:32000,day_of_month:8,active:false}];
  const pending=recurringOccurrences(rules,[],"2027-02");
  assert.equal(pending.length,1);
  assert.equal(pending[0].day,"2027-02-28");
  assert.equal(pending[0].status,"planned");
  assert.equal(financeTotals({extras:[]},"2027-02-01","2027-02-28").cost,0);
  const posted=[{id:"cost-1",recurrence_id:"rule-a",recurrence_month:"2027-02-01",
    category:"보험료",expense_date:"2027-02-28",amount_won:65000}];
  assert.equal(recurringOccurrences(rules,posted,"2027-02")[0].status,"recorded");
  assert.equal(financeTotals({extras:posted},"2027-02-01","2027-02-28").cost,65000);
  assert.equal(plannedExpenseDate("2028-02",31),"2028-02-29");
  assert.equal(plannedExpenseDate("2027-04",31),"2027-04-30");
});
test("payout schedule dates never change actual payment or revenue",()=>{
  const week={cycle:"weekly",weekday:1};
  assert.equal(nextPayoutDate(week,"2026-11-19"),"2026-11-23");
  assert.equal(nextPayoutDate(week,"2026-11-23"),"2026-11-23");
  const monthly={cycle:"monthly",month_day:31};
  assert.equal(nextPayoutDate(monthly,"2027-02-27"),"2027-02-28");
  assert.equal(nextPayoutDate(monthly,"2027-02-28"),"2027-02-28");
  assert.equal(nextPayoutDate(monthly,"2027-03-01"),"2027-03-31");
  assert.equal(nextPayoutDate({cycle:"none"},"2027-02-27"),null);
});
test("monthly comparisons return ordered actual totals and no fictional values",()=>{
  const data={earnings:[{work_date:"2026-10-15",gross_won:50000},
    {work_date:"2026-11-02",gross_won:70000}]};
  const months=financeMonths(data,"2026-11-19",3);
  assert.deepEqual(months.map(x=>x.month),["2026-09","2026-10","2026-11"]);
  assert.deepEqual(months.map(x=>x.gross),[0,50000,70000]);
});

test("account transitions never reveal the previous rider's financial records",()=>{
  const privateRecords={earnings:[{gross_won:9999999}]};
  assert.equal(accountFinanceData("user-b","user-a",privateRecords),null);
  assert.equal(accountFinanceData(null,"user-a",privateRecords),null);
  assert.equal(accountFinanceData("user-a","user-a",privateRecords),privateRecords);
});

test("calendar-paid and fuel dates roll over at midnight alongside rider earnings",()=>{
  const before=new Date("2026-11-18T14:59:59Z"),after=new Date("2026-11-18T15:00:00Z");
  assert.equal(koreanCalendarDay(before),"2026-11-18");
  assert.equal(koreanCalendarDay(after),"2026-11-19");
  assert.equal(koreanWorkDay(after),"2026-11-19");
});
