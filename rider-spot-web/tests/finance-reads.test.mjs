import test from 'node:test';
import assert from 'node:assert/strict';
import {readIncomeForEdit, sumRideDays} from '../src/finance-reads.mjs';
import {dailyRideSnapshot, completedRideRows} from '../src/ride-insights.mjs';

test('month overview produces the same daily totals in one history scan', () => {
  const history=[
    {id:'a',started_at:'2026-01-31T14:55:00Z', ended_at:'2026-01-31T15:05:00Z',distance_km:2},
    {id:'b',started_at:'2026-01-31T15:05:00Z', ended_at:'2026-01-31T15:15:00Z',distance_km:3}
  ];
  const days=['2026-01-31','2026-02-01','2026-02-02'];
  assert.deepEqual(sumRideDays(completedRideRows(history),days),days.map(day=>dailyRideSnapshot(history,day)));
});
test('manual edits fetch all matching rows for the chosen day and account',async()=>{
  const calls=[];
  const client={from(table){assert.equal(table,'rider_earnings');return {
    select(){return this},eq(k,v){calls.push([k,v]);return this},order(){return this},
    range(offset){return {data:Array.from({length:offset===0?500:1},()=>({gross_won:1000}))}}
  }}};
  const rows=await readIncomeForEdit(client,'account','2025-01-01','배민');
  assert.equal(rows.length,501);
  assert.deepEqual(calls.slice(0,3),[['user_id','account'],['work_date','2025-01-01'],['platform','배민']]);
});
