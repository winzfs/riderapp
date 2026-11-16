(0,S.useEffect)(()=>{
  const absorb=(event)=>{
    const detail=event?.detail;
    const trip=y.current;
    if(!trip?.id||b.current||detail?.tripId!==trip.id||!Array.isArray(detail.points))return;
    const known=new Map();
    const good=p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180&&Number.isFinite(Number(p.t))&&Number(p.t)>0;
    for(const item of (trip.points||[]))if(good(item))known.set(Number(item.t),item);
    let changed=false;
    const start=Date.parse(trip.started_at)||0;
    for(const raw of detail.points){
      if(!good(raw))continue;
      const time=Number(raw.t);
      if(time<start-15000||time>Date.now()+15000)continue;
      const p={lat:Number(raw.lat),lng:Number(raw.lng),accuracy:Number(raw.accuracy)||0,heading:Number(raw.heading)||0,speed:Number(raw.speed)||0,t:time};
      const prev=known.get(time);
      if(!prev||p.accuracy>0&&(Number(prev.accuracy)<=0||p.accuracy<Number(prev.accuracy))){known.set(time,p);changed=true;}
    }
    if(!changed)return;
    const points=[...known.values()].sort((a,b)=>a.t-b.t).slice(-14999);
    for(let j=1;j<points.length;j++) if(points[j].t-points[j-1].t>45000)points[j]={...points[j],break:true};
    // Single source of truth: SQLite samples, not the WebView's GPS callbacks.
    ie({...trip,points,distance_km:es(points)});
    const final=points.at(-1);
    if(final&&Date.now()-final.t<60000){r(final);re.current=final;setGpsStatus('ready');setGpsProblem('');}
  };
  window.addEventListener('riderspot:native-sqlite-points',absorb);
  return()=>window.removeEventListener('riderspot:native-sqlite-points',absorb);
},[e?.id]);