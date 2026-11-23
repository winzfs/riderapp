/* v57: patch verified calendar functions in the same release bundle.
 * Applied after existing MapLayers + Stores transformations. Fail closed if
 * the current bundled code changes; never fall back to stale app sources.
 */
function rsPatchMidnightAssetV57(source){
  function once(find,replacement,label){
    const i=source.indexOf(find);
    if(i<0||source.indexOf(find,i+find.length)>=0)
      throw new Error('Midnight calendar source mismatch: '+label);
    source=source.slice(0,i)+replacement+source.slice(i+find.length);
  }
  once('gi=r=>oo(new Date(r).getTime()-10800*1e3)',
       'gi=r=>oo(r)','timeline date');
  once('return Number(n.hour)<3?Ps(s,-1):s}',
       'return s}','finance date');
  once('function _(N){let S=new Date(N-108e5)',
       'function _(N){let S=new Date(N)','auto date');

  const hook='};if(N.useEffect(()=>{if(!S||!C){R({forUser:null,forDay:null,rows:[],loading:!1,error:"",capped:!1});return}';
  const revised='};N.useEffect(()=>{let prior=_(Date.now());const check=()=>{const today=_(Date.now());if(today!==prior){prior=today;Z(old=>old<today?today:old)}};const timer=setInterval(check,15000);document.addEventListener("visibilitychange",check);window.addEventListener("focus",check);return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",check);window.removeEventListener("focus",check)}},[]);if(N.useEffect(()=>{if(!S||!C){R({forUser:null,forDay:null,rows:[],loading:!1,error:"",capped:!1});return}';
  once(hook,revised,'auto list React midnight state');

  const start=source.indexOf('function Id(r,n){let s=');
  const end=source.indexOf('var Av=r=>',start);
  if(start<0||source.indexOf('function Id(r,n){let s=',start+1)>=0||
     end<=start||end-start>2600)
    throw new Error('Midnight trip projector mismatch');
  const newGroup="function Id(r,n){\n  const dayStart=Date.parse(n+\"T00:00:00+09:00\"),dayEnd=dayStart+86400000;\n  if(!Number.isFinite(dayStart))return null;\n  const now=Date.now(),items=[],rad=Math.PI/180;\n  function segmentKm(points){\n    let meters=0;\n    for(let i=1;i<points.length;i++){\n      const a=points[i-1],b=points[i];\n      if(b.break)continue;\n      const lat1=Number(a.lat),lng1=Number(a.lng),lat2=Number(b.lat),lng2=Number(b.lng);\n      if(![lat1,lng1,lat2,lng2].every(Number.isFinite))continue;\n      const dt=Number(b.t)-Number(a.t);\n      if(!Number.isFinite(dt)||dt<0||dt>120000)continue;\n      const x=(lat2-lat1)*rad,y=(lng2-lng1)*rad;\n      const z=Math.sin(x/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(y/2)**2;\n      const distance=12742000*Math.atan2(Math.sqrt(z),Math.sqrt(Math.max(0,1-z)));\n      if(distance<1200&&(dt===0||distance/(dt/1000)<=48))meters+=distance;\n    }\n    return meters/1000;\n  }\n  for(const item of Array.isArray(r)?r:[]){\n    const from=vn(item?.started_at),to=vn(item?.ended_at)||now;\n    if(!from||to<=dayStart||from>=dayEnd||to<=from)continue;\n    const begin=Math.max(from,dayStart),finish=Math.min(to,dayEnd);\n    if(finish<=begin)continue;\n    if(from>=dayStart&&to<=dayEnd){items.push(item);continue;}\n    const points=(Array.isArray(item.points)?item.points:[]).filter(point=>{\n      const t=Number(point?.t);return Number.isFinite(t)&&t>=begin&&t<finish;\n    });\n    const events=(Array.isArray(item.events)?item.events:[]).filter(event=>{\n      const t=vn(event?.at);return t&&t>=begin&&t<finish;\n    });\n    items.push({...item,started_at:new Date(begin).toISOString(),\n      ended_at:item.ended_at?new Date(finish).toISOString():null,\n      points,events,distance_km:segmentKm(points),\n      calendar_segment:true,original_started_at:item.started_at});\n  }\n  items.sort((a,b)=>vn(a.started_at)-vn(b.started_at)||\n    String(a.id).localeCompare(String(b.id)));\n  if(!items.length)return null;\n  const points=[],events=[];\n  let distanceKm=0,durationMs=0,latestEnd=0,count=0;\n  for(const item of items){\n    distanceKm+=Math.max(0,Number(item.distance_km)||0);\n    const from=vn(item.started_at),to=vn(item.ended_at);\n    if(from)durationMs+=Math.max(0,(to||Math.min(now,dayEnd))-from);\n    latestEnd=Math.max(latestEnd,to||from||0);\n    const samples=Array.isArray(item.points)?item.points:[];\n    count+=samples.length;\n    if(samples.length){\n      points.push({...samples[0],break:true});\n      for(let i=1;i<samples.length;i++)points.push(samples[i]);\n    }\n    for(const event of Array.isArray(item.events)?item.events:[])\n      if(event&&vn(event.at))events.push(event);\n  }\n  events.sort((a,b)=>vn(a.at)-vn(b.at));\n  const first=items[0].started_at;\n  return {day:n,trips:items,distanceKm,durationMs,originalPointCount:count,\n    route:{id:\"day:\"+n,started_at:first,\n      ended_at:latestEnd?new Date(latestEnd).toISOString():first,\n      points,events,distance_km:distanceKm,readonly:true}};\n}";
  source=source.slice(0,start)+newGroup+source.slice(end);

  const calendar='let gt=S.history.filter(te=>vn(te?.started_at)),Dt=new Map;for(let te of gt){let Ke=gi(te.started_at);Dt.has(Ke)||Dt.set(Ke,[]),Dt.get(Ke).push(te)}';
  const corrected='let gt=[...S.history,...(S.trip&&!S.trip.ended_at?[S.trip]:[])].filter(te=>vn(te?.started_at)),Dt=new Map;for(let te of gt){let start=gi(te.started_at),end=gi(te.ended_at||Date.now());for(let day=start,i=0;day<=end&&i<32;day=Tu(day,1),i++){Dt.has(day)||Dt.set(day,[]);Dt.get(day).push(te)}}';
  once(calendar,corrected,'calendar date indicators');
  once('Id(S.history,fe),[S.history,fe]',
       'Id([...S.history,...(S.trip&&!S.trip.ended_at?[S.trip]:[])],fe),[S.history,S.trip,fe]',
       'active GPS read-only daily projection');
  once('q=S.trip?.started_at?gi(S.trip.started_at):Z','q=Z','live date');
  once('let te=()=>X(gi(Date.now())),Ke=setInterval(te,6e4)',
       'let te=()=>{let day=gi(Date.now());X(day);if(window.__rsRideApi?.trip&&!window.__rsRideApi.trip.ended_at)pe(day)},Ke=setInterval(te,15000)',
       'midnight timeline date follow');

  return source;
}
