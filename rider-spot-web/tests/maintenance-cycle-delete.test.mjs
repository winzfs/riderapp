import test from "node:test";
import assert from "node:assert/strict";
import {serviceBaseline,serviceDue,serviceRows,itemsOf} from "../src/maintenance-model.mjs";

test("newer log without mileage cannot erase known last replacement or the 60300/40000 calculation",()=>{
  const rows=[
    {id:"missing",item:"뒤 타이어",service_items:["뒤 타이어"],serviced_on:"2026-11-18",created_at:"2026-11-18T12:00:00Z",odometer_km:null,next_due_km:null},
    {id:"measured",item:"앞 타이어 · 뒤 타이어",service_items:["앞 타이어","뒤 타이어"],serviced_on:"2026-11-18",created_at:"2026-11-18T11:00:00Z",odometer_km:40000,next_due_km:null},
  ];
  assert.equal(serviceRows(rows,"뒤 타이어")[0].id,"missing");
  assert.deepEqual(itemsOf(rows[1]),["앞 타이어","뒤 타이어"]);
  const lastKnown=serviceBaseline(rows,"뒤 타이어");
  assert.equal(lastKnown.id,"measured");
  assert.deepEqual(serviceDue(lastKnown,{interval_km:40000},60300),{
    next:80000,remaining:19700,state:"ok",threshold:500
  });
  assert.equal(serviceDue(serviceBaseline(rows,"앞 타이어"),{interval_km:40000},60300).remaining,19700);
  assert.equal(serviceDue(serviceBaseline(rows.filter(row=>row.id!=="measured"),"뒤 타이어"),{interval_km:40000},60300).next,null);
});

test("after deleting latest mileage log fallback recalculates from remaining known log",()=>{
  const rows=[
    {id:"newer",item:"뒤 타이어",serviced_on:"2026-11-18",odometer_km:40000},
    {id:"older",item:"뒤 타이어",serviced_on:"2026-08-01",odometer_km:20000}
  ];
  assert.equal(serviceDue(serviceBaseline(rows,"뒤 타이어"),{interval_km:40000},60300).remaining,19700);
  assert.equal(serviceDue(serviceBaseline(rows.filter(x=>x.id!=="newer"),"뒤 타이어"),{interval_km:40000},60300).remaining,-300);
});

test("null, no cycle, and explicit due mileage remain safe",()=>{
  assert.equal(serviceDue({odometer_km:40000},null,60300).next,null);
  assert.equal(serviceDue({odometer_km:40000,next_due_km:85000},{interval_km:40000},60300).next,85000);
  assert.equal(serviceBaseline([{item:"뒤 타이어",serviced_on:"2026-11-18",odometer_km:null}],"뒤 타이어"),null);
});
