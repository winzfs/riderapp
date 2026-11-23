/* RiderSpot v57: KST calendar midnight, without any WebView navigation.
 * Earnings are always a 00:00-23:59 date, even when no ride is active.
 * Existing native accessibility capture/ack and the continuous SQLite GPS
 * recorder are NEVER stopped, restarted or altered by this module.
 */
(function midnightRolloverV57(win){
 'use strict';
 if(!win||win.__rsMidnightRolloverV57)return;
 win.__rsMidnightRolloverV57=true;
 const doc=win.document;
 const dateFormat=new Intl.DateTimeFormat('en-CA',{
   timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
 });
 const hourFormat=new Intl.DateTimeFormat('en-GB',{
   timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'
 });
 const calendar=(now=Date.now())=>{
   const p=Object.fromEntries(dateFormat.formatToParts(new Date(now)).map(x=>[x.type,x.value]));
   return p.year+'-'+p.month+'-'+p.day;
 };
 const nextMidnight=(now=Date.now())=>{
   const midnight=Date.parse(calendar(now)+'T00:00:00+09:00');
   return midnight+86400000;
 };
 win.__rsMidnightMathV57=Object.freeze({calendar,nextMidnight});
 const format=new Intl.NumberFormat('ko-KR');
 let currentDay=calendar(),timer=null,observer=null,watched=null;
 let currentAccount=null,lastFetch=0,reading=false,version=0;
 let cached=null;

 function isEarlyMorning(){
   const hour=Number(hourFormat.format(new Date()));
   return hour>=0&&hour<3;
 }
 function paint(){
   if(!isEarlyMorning())return;
   const panel=doc.getElementById('rs-native-income-panel-v1');
   if(!panel||!panel.isConnected)return;
   const amounts=panel.querySelectorAll('.rsai-stat .rsai-value');
   if(amounts.length<2)return;
   if(!cached||cached.day!==currentDay){
     if(amounts[0].textContent!=='확인 중')amounts[0].textContent='확인 중';
     if(amounts[1].textContent!=='—')amounts[1].textContent='—';
     return;
   }
   const money=format.format(cached.gross)+'원';
   const count=cached.captures+'건';
   if(amounts[0].textContent!==money)amounts[0].textContent=money;
   if(amounts[1].textContent!==count)amounts[1].textContent=count;
   const timeline=doc.getElementById('rs-native-income-day-total');
   if(timeline?.isConnected){
     const text='오늘 누적 수익 '+money+' · 자동 반영 '+count;
     if(timeline.textContent!==text)timeline.textContent=text;
   }
 }
 function observePanel(){
   const next=doc.getElementById('rs-native-income-panel-v1');
   if(next===watched)return;
   observer?.disconnect();observer=null;
   watched=next||null;
   if(watched&&typeof MutationObserver==='function'){
     observer=new MutationObserver(paint);
     observer.observe(watched,{childList:true});
   }
   paint();
 }
 async function fetchToday(force=false){
   if(!isEarlyMorning()||doc.hidden||reading)return;
   const now=Date.now();
   if(!force&&now-lastFetch<35000)return;
   const client=win.__rsClient;
   if(!client?.auth?.getSession)return;
   reading=true;lastFetch=now;const serial=++version;
   try{
     const auth=await client.auth.getSession();
     const uid=auth?.data?.session?.user?.id;
     if(!uid)return;
     const day=calendar();
     if(day!==currentDay)return;
     if(currentAccount&&uid!==currentAccount)cached=null;
     currentAccount=uid;
     const [amounts,captures]=await Promise.all([
       client.from('rider_earnings')
         .select('gross_won,gross_entered')
         .eq('user_id',uid).eq('work_date',day).limit(500),
       client.from('rider_auto_deliveries')
         .select('status')
         .eq('user_id',uid).eq('work_date',day).limit(500)
     ]);
     if(serial!==version||day!==calendar()||amounts.error||captures.error)return;
     const rows=Array.isArray(amounts.data)?amounts.data:[];
     const records=Array.isArray(captures.data)?captures.data:[];
     if(rows.length===500||records.length===500)return;
     cached={
       day,gross:rows.filter(r=>r.gross_entered!==false)
         .reduce((sum,r)=>sum+(Number(r.gross_won)||0),0),
       captures:records.filter(r=>r.status==='applied').length
     };
     paint();
   }catch{
     // Do not display a misleading 0 when the network or account is unavailable.
   }finally{reading=false;}
 }
 function boundary(){
   const nowDay=calendar();
   if(nowDay===currentDay)return;
   currentDay=nowDay;cached=null;currentAccount=null;lastFetch=0;++version;
   paint();
   // Finance React components refresh their ledger in place. No route reload.
   win.dispatchEvent(new Event('riderspot:finance-changed'));
   win.dispatchEvent(new Event('riderspot:day-changed'));
   void fetchToday(true);
 }
 function scheduleMidnight(){
   if(timer!==null)win.clearTimeout(timer);
   const next=nextMidnight();
   const delay=Math.max(25,Math.min(86400020,next-Date.now()+120));
   timer=win.setTimeout(()=>{
     timer=null;boundary();scheduleMidnight();
   },delay);
 }
 function wake(){
   boundary();scheduleMidnight();observePanel();
   void fetchToday();
 }
 const poll=()=>{
   boundary();observePanel();void fetchToday();
 };
 win.addEventListener('focus',wake);
 win.addEventListener('riderspot:screen',wake);
 win.addEventListener('riderspot:tab-restored',wake);
 win.addEventListener('riderspot:auto-income-updated',()=>{lastFetch=0;void fetchToday(true)});
 win.addEventListener('riderspot:finance-changed',()=>{
   if(isEarlyMorning())lastFetch=0;
   void fetchToday();
 });
 doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)wake()});
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',wake,{once:true});
 else wake();
 win.setInterval(poll,15000); // resumes after Android WebView timer suspension
})(typeof window==='undefined'?null:window);
