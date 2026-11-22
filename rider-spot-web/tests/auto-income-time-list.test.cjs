const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../src/auto-income-time-list.js"),"utf8");
function load(){
  const window={addEventListener(){},removeEventListener(){}};
  const document={visibilityState:"visible",addEventListener(){},removeEventListener(){}};
  vm.runInNewContext(source,{window,document,Intl,Date,Number,Object,Set,String,Array,Math}, {timeout:1000});
  return window;
}
test("Delivery workday uses 03:00 KST cutoff, not midnight",()=>{
  const x=load().__rsAutoIncomeTimeUtils;
  assert.equal(x.koreaWorkDay(Date.parse("2026-11-22T17:59:59Z")),"2026-11-22");
  assert.equal(x.koreaWorkDay(Date.parse("2026-11-22T18:00:00Z")),"2026-11-23");
  assert.equal(x.moveWorkDay("2026-11-22",-1),"2026-11-21");
  assert.equal(x.moveWorkDay("2026-11-30",1),"2026-12-01");
});
test("Missing or invalid capture time is never replaced by server-created time",()=>{
  const x=load().__rsAutoIncomeTimeUtils;
  assert.equal(x.validDate(null),null);
  assert.equal(x.validDate(""),null);
  assert.equal(x.validDate("bogus"),null);
  assert.equal(x.validDate("2026-11-22T12:35:15Z").toISOString(),"2026-11-22T12:35:15.000Z");
});
test("Every order is fetched for selected day using server pagination",()=>{
  assert.match(source,/\.eq\("user_id",userId\)/);
  assert.match(source,/\.eq\("work_date",day\)/);
  assert.match(source,/\.order\("captured_at",\{ascending:false\}\)/);
  assert.match(source,/\.range\(start,start\+pageSize-1\)/);
  assert.match(source,/const pageSize=200;/);
  assert.match(source,/const maxRecords=20000;/);
  assert.doesNotMatch(source,/\.limit\(80\)/);
});
test("Display sum only applied deliveries; review/covered/rejected never double-counted",()=>{
  const x=load().__rsAutoIncomeTimeUtils;
  const summary=x.summarizeDay([
    {status:"applied",gross_won:5715},
    {status:"applied",gross_won:3105},
    {status:"needs_review",gross_won:15000},
    {status:"covered",gross_won:2700},
    {status:"rejected",gross_won:745}]);
  assert.equal(summary.recorded,5);
  assert.equal(summary.applied,2);
  assert.equal(summary.appliedAmount,8820);
  assert.equal(summary.review,1);
});
test("Read-only: never writes incomes, navigates or refreshes the WebView",()=>{
  assert.match(source,/\.from\("rider_auto_deliveries"\)/);
  assert.match(source,/\.select\("capture_id,captured_at,created_at,work_date/);
  assert.doesNotMatch(source,/\.upsert\(|\.insert\(|\.update\(|\.delete\(|location\.reload\(|history\.replaceState\(/);
});
test("Date selection, 12-row screen paging and original receipt time rendering",()=>{
  assert.match(source,/type:"date",value:day,max:today/);
  assert.match(source,/setVisibleCount\(n=>n\+20\)/);
  assert.match(source,/captured\?captureClock\.format\(captured\)/);
  assert.match(source,/delay>30000\?" · 서버 저장 "/);
  assert.match(source,/needs_review:"중복 확인 필요 · 합산 전"/);
});
test("React view exposes all selected-day delivery records and Korean time",()=>{
  const root=load();
  const records=[
    {capture_id:"1795351289264-0",captured_at:"2026-11-22T12:35:14Z",
      created_at:"2026-11-22T12:36:32Z",work_date:"2026-11-22",
      platform:"쿠팡이츠",gross_won:5715,base_won:2470,extra_won:2500,reward_won:745,status:"applied"},
    {capture_id:"1795351289264-1",captured_at:"2026-11-22T12:40:11Z",
      created_at:"2026-11-22T12:40:12Z",work_date:"2026-11-22",
      platform:"배민",gross_won:3105,base_won:2700,extra_won:0,reward_won:405,status:"applied"},
    {capture_id:"1795351289264-2",captured_at:"2026-11-22T12:45:02Z",
      created_at:"2026-11-22T12:45:03Z",work_date:"2026-11-22",
      platform:"배민",gross_won:14900,base_won:14900,extra_won:0,reward_won:0,status:"needs_review"}];
  const stateSlots=[
    "2026-11-22",12,
    {forUser:"account-1",forDay:"2026-11-22",rows:records,loading:false,error:"",capped:false},0
  ];
  let slot=0;
  const React={
    createElement(type,props,...children){return {type,props,children};},
    Fragment:"Fragment",
    useState(init){const i=slot++;return [i<stateSlots.length?stateSlots[i]:(typeof init==="function"?init():init),()=>{}];},
    useEffect(){}
  };
  const tree=root.__rsAutoIncomeTimes({React,client:{},userId:"account-1"});
  const collect=node=>{
    if(node==null)return "";
    if(typeof node==="string"||typeof node==="number")return String(node)+" ";
    if(Array.isArray(node))return node.map(collect).join("");
    return (node.children||[]).map(collect).join("");
  };
  const text=collect(tree);
  assert.match(text,/일별 배달 수익/);
  assert.match(text,/21:35:14/);
  assert.match(text,/21:40:11/);
  assert.match(text,/21:45:02/);
  assert.match(text,/서버 저장 21:36:32/);
  assert.match(text,/8,820원/);
  assert.match(text,/3건 기록 · 2건 반영/);
  assert.match(text,/중복 확인 필요/);
  assert.match(text,/기본 2,470/);
  assert.match(text,/리워드 745/);
  assert.doesNotMatch(text,/23,720원/);
});
test("Different account or different selected day never displays stale private rows",()=>{
  const root=load();
  let i=0;
  const React={createElement(t,p,...c){return {type:t,props:p,children:c};},
    useState(v){const idx=i++;return [
      idx===0?"2026-11-22":idx===1?12:idx===2?
        {forUser:"different-user",forDay:"2026-11-22",rows:[
          {status:"applied",gross_won:999999,capture_id:"private"}],loading:false,error:"",capped:false}:0,
      ()=>{}];},useEffect(){},Fragment:"Fragment"};
  const tree=root.__rsAutoIncomeTimes({React,client:{},userId:"current-user"});
  const serial=JSON.stringify(tree);
  assert.doesNotMatch(serial,/999999|private/);
});
