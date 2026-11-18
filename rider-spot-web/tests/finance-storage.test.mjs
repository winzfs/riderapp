import test from "node:test";
import assert from "node:assert/strict";
import {amountWon,incomeDay,incomeDayDiff,financeWriteError,
 saveIncomeDay,saveIncomeRecord} from "../src/finance-storage.mjs";

test("daily income keeps null distinct from zero, avoids duplicate writes",()=>{
  assert.deepEqual(incomeDayDiff({쿠팡이츠:"85,000",배민:""},{쿠팡이츠:80000,배민:null}),
    {changes:{쿠팡이츠:85000},expected:{쿠팡이츠:80000}});
  assert.deepEqual(incomeDayDiff({쿠팡이츠:0,배민:""},{쿠팡이츠:null,배민:null}),
    {changes:{쿠팡이츠:0},expected:{쿠팡이츠:null}});
  assert.deepEqual(incomeDayDiff({쿠팡이츠:"",배민:""},{쿠팡이츠:null,배민:null}),
    {changes:{},expected:{}});
  assert.equal(amountWon("1,000,000"),1000000);
  for(const bad of ["-1","0.1",100000001,Infinity])assert.throws(()=>amountWon(bad));
  assert.throws(()=>incomeDay("2026-02-31"));
  assert.equal(incomeDay("2028-02-29"),"2028-02-29");
});
test("timeline and finance share atomic all-or-nothing daily RPC",async()=>{
  const calls=[];
  const client={rpc:async(name,args)=>{calls.push({name,args});return {data:null,error:null};}};
  const result=await saveIncomeDay(client,{userId:"test-rider",day:"2026-11-19",
    draft:{쿠팡이츠:"90,000",배민:"20,000"},previous:{쿠팡이츠:80000,배민:null}});
  assert.equal(result.changed,true);
  assert.equal(calls.length,1,"both platforms must commit as one database transaction");
  assert.equal(calls[0].name,"rs_save_daily_income_guarded");
  assert.deepEqual(calls[0].args.p_values,{쿠팡이츠:90000,배민:20000});
  assert.deepEqual(calls[0].args.p_expected,{쿠팡이츠:80000,배민:null});
  const unchanged=await saveIncomeDay(client,{userId:"test-rider",day:"2026-11-19",
    draft:{쿠팡이츠:90000},previous:{쿠팡이츠:90000}});
  assert.equal(unchanged.changed,false);assert.equal(calls.length,1);
});
test("finance detailed edits send expected record revision and never invent user IDs",async()=>{
  const calls=[];
  const client={rpc:async(name,args)=>{calls.push({name,args});return {data:"saved-uuid",error:null};}};
  const saved=await saveIncomeRecord(client,{userId:"test-rider",id:"record-id",
    day:"2026-11-19",platform:"쿠팡이츠",gross:"85,000",deliveries:12,
    expenses:"3,000",note:"test",expectedUpdated:"2026-11-18T11:00:00+00:00"});
  assert.equal(saved,"saved-uuid");
  assert.equal(calls[0].name,"rs_save_income_record");
  assert.equal(calls[0].args.p_gross,85000);
  assert.equal(calls[0].args.p_expenses,3000);
  assert.equal(calls[0].args.p_expected_updated,"2026-11-18T11:00:00+00:00");
  assert.throws(()=>incomeDayDiff({쿠팡이츠:"bad"},{}));
  await assert.rejects(saveIncomeRecord(client,{id:"record-id",day:"2026-11-19",
    platform:"배민",gross:1000,expectedUpdated:null}),/새로 조회/);
});
test("save conflicts do not issue successful commit events",async()=>{
  let messages=0;
  const client={rpc:async()=>({error:{message:"RS_INCOME_CONFLICT"}})};
  await assert.rejects(()=>saveIncomeDay(client,{userId:"r",day:"2026-11-19",
    draft:{쿠팡이츠:100},previous:{쿠팡이츠:null}}),/다른 기기/);
  assert.match(financeWriteError({message:"RS_DUPLICATE_DAY_PLATFORM"}),/기존/);
  assert.match(financeWriteError({message:"RS_SETTLED_INCOME"}),/입금 확인/);
  assert.equal(messages,0);
});
