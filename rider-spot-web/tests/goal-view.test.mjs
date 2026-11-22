import test from "node:test";
import assert from "node:assert/strict";
import {monthGoalProjection as calculate} from "../src/goal-view.mjs";
const base={monthFrom:"2026-11-01",monthTo:"2026-11-30",today:"2026-11-22",
  plannedWorkDays:25,workedDays:17,target:2500000,value:532569,uncertain:false};
test("11월 예시: 8일, 1,967,431원, 하루 245,929원",()=>{
  assert.deepEqual(calculate(base),{remaining:1967431,remainingWorkDays:8,perDay:245929});
});
test("월말 이후/예정 근무일 소진에 허위 하루가 없다",()=>{
  assert.equal(calculate({...base,today:"2026-12-01"}).perDay,null);
  assert.equal(calculate({...base,workedDays:25}).remainingWorkDays,0);
  assert.equal(calculate({...base,workedDays:25}).perDay,null);
});
test("달성/불명확 비용",()=>{
  assert.equal(calculate({...base,value:2500000}).perDay,0);
  assert.equal(calculate({...base,uncertain:true}).perDay,null);
});
test("예정 근무일이 실제 남은 날짜를 넘을 수 없다",()=>{
  assert.equal(calculate({...base,workedDays:0}).remainingWorkDays,8);
});
