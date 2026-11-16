const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync(require('node:path').join(__dirname,'rider-gps-recovery-v42.js'),'utf8');
const OLD='123e4567-e89b-12d3-a456-426614174000';
const NEW='123e4567-e89b-12d3-a456-426614174001';
function setup(){
 const storage=new Map(); let timers=[]; const calls=[]; const elements=new Map();let nav=null, reloads=0;
 const make=tag=>({tag,children:[],handlers:{},disabled:false,textContent:'',style:{},setAttribute(){},append(...arr){this.children.push(...arr)},prepend(el){elements.set(el.id,el);this.children.unshift(el)},remove(){elements.delete(this.id)},addEventListener(t,f){this.handlers[t]=f}});
 const bannerRoot=make('div'); const state={activeId:OLD,startedAt:Date.now()-600000,nativePointCount:1,gpsServiceActive:true,gpsLastSavedAt:Date.now()};
 const point={seq:1,lat:35.1,lng:126.8,t:Date.now()-200000,accuracy:7};
 const host={onmessage(){},postMessage(str){const r=JSON.parse(str);calls.push(r); const answer=r.action==='state'?state:r.action==='points'?{points:r.afterSeq?[]:[point]}:{}; Promise.resolve().then(()=>host.onmessage({data:JSON.stringify({id:r.id,ok:true,data:answer})}));}};
 const window={RiderSpotHost:host,__rsNativeInstalled:true,__rsRideApi:{trip:{id:NEW,started_at:new Date().toISOString(),points:[],events:[]},paused:false}, __rsGoToTab(x){nav=x;}, __rsClient:{auth:{getUser:async()=>({data:{user:{id:'one-user'}}})}}, addEventListener(){},dispatchEvent(){}};
 const document={visibilityState:'visible',body:{},querySelector(s){if(s.startsWith('#'))return elements.get(s.slice(1))||null;if(s.includes('.rs33-trip-detail'))return bannerRoot;return null},getElementById(id){return elements.get(id)||null},createElement:make,addEventListener(){}};
 const localStorage={getItem(k){return storage.get(k)||null},setItem(k,v){storage.set(k,v)}};
 const sessionStorage={getItem(){return null},removeItem(){}};
 const location={reload(){reloads++}};
 const ctx={window,document,localStorage,sessionStorage,location,setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){},setInterval(){},console,Date,Math,Promise,Map,Number,Error,JSON,CustomEvent:class {constructor(type,o){this.type=type;this.detail=o.detail}}};
 vm.runInNewContext(code,ctx);
 return {ctx,window,document,storage,calls,bannerRoot,get nav(){return nav},get reloads(){return reloads}};
}
test('preflight blocks a second Android recording when a stale native trip is already active',async()=>{
 const t=setup();const prevent=await t.window.__rsGPS42PreflightStart();
 assert.equal(prevent,true);assert.equal(t.nav,'trips');assert.deepEqual(t.calls.map(x=>x.action),['state']);assert.equal(t.bannerRoot.children.length,1);
});
test('explicit restore imports native samples without stopping GPS or uploading data',async()=>{
 const t=setup(); const userid='one-user'; const duplicate={id:NEW,started_at:new Date().toISOString(),points:[],events:[]};
 t.storage.set('rs:active:'+userid,JSON.stringify(duplicate));
 await t.window.__rsGPS42PreflightStart();
 const banner=t.bannerRoot.children[0];const button=banner.children[1];
 await button.handlers.click();
 const restored=JSON.parse(t.storage.get('rs:active:'+userid));
 assert.equal(restored.id,OLD);assert.equal(restored.points.length,1);assert.equal(restored.events.length,1);
 assert.equal(JSON.parse(t.storage.get('rs:trip-rescue:'+NEW)).id,NEW);
 assert.equal(t.reloads,1);
 assert.ok(!t.calls.some(x=>['stop','pause','oauth-open','sync'].includes(x.action)));
});
test('mismatched native recording displays recovery action, not a new recording',async()=>{
 const t=setup(); const poll=t.window.__rsGPS41Poll;
 assert.equal(typeof poll,'function');
 await poll();
 assert.ok(t.bannerRoot.children.some(el=>el.id==='rs-gps-v42-recovery'));
 assert.ok(!t.calls.some(x=>x.action==='start'));
});
test('without native message bridge, web PWA is unaffected',()=>{
 const window={__rsNativeInstalled:false};vm.runInNewContext(code,{window,console});
 assert.equal(window.__rsGPS42Installed,undefined);
});