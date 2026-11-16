/* Rider Spot v43. Display-only algorithms: NEVER alter original GPS points. */
function rs43Meters(a,b){
  if(!a||!b) return Infinity;
  const r=Math.PI/180;
  const dLat=(b.lat-a.lat)*r,dLng=(b.lng-a.lng)*r;
  const s=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLng/2)**2;
  return 12742000*Math.atan2(Math.sqrt(s),Math.sqrt(Math.max(0,1-s)));
}
function rs43CleanPaths(groups){
 return groups.map(path=>{
  if(!Array.isArray(path)||path.length<3)return path||[];
  const output=[];
  let i=0;
  while(i<path.length){
   const pivot=path[i];
   let j=i+1;
   while(j<path.length){
    const gap=(path[j].time??0)-(pivot.time??0);
    if(gap<0 || gap>1800000)break;
    const radius=rs43Meters(pivot,path[j]);
    if(radius<=24){j++;continue;}
    // Ignore a single noisy sample which immediately returns to the stop radius.
    if(j+1<path.length&&rs43Meters(pivot,path[j+1])<=24){j+=2;continue;}
    break;
   }
   const span=path.slice(i,j);
   const duration=span.length>1?(span.at(-1).time??0)-(span[0].time??0):0;
   if(span.length>=5&&duration>=25000){
    const lat=span.map(p=>p.lat).sort((a,b)=>a-b);
    const lng=span.map(p=>p.lng).sort((a,b)=>a-b);
    const center={...span[0],lat:lat[Math.floor(lat.length/2)],lng:lng[Math.floor(lng.length/2)]};
    if(output.length&&rs43Meters(output.at(-1),center)<6)output[output.length-1]=center;
    else output.push(center);
    i=j;
    continue;
   }
   const next=path[i];
   if(!output.length||rs43Meters(output.at(-1),next)>=7){output.push(next);}
   i++;
  }
  const last=path.at(-1);
  if(last&&(!output.length||rs43Meters(last,output.at(-1))>=7))output.push(last);
  return output.length?output:[path[0]];
 }).filter(p=>p&&p.length);
}
function rs43Revisits(groups){
 const rails=[];
 const cells=new Map();
 const zones=[];
 let cumulative=0;
 const centerLat=groups.flat().reduce((x,p,_,a)=>x+p.lat/a.length,0)||35;
 const latMeter=111120,lonMeter=111120*Math.cos(centerLat*Math.PI/180);
 const bin=24;
 const threshold=19;
 for(let g=0;g<groups.length;g++){
  const path=groups[g];
  for(let i=1;i<path.length;i++){
   const from=path[i-1],to=path[i],len=rs43Meters(from,to);
   if(!Number.isFinite(len)||len<8||len>110){if(Number.isFinite(len)&&len<20000)cumulative+=len;continue;}
   cumulative+=len;
   const x=(from.lng+to.lng)/2*lonMeter,y=(from.lat+to.lat)/2*latMeter;
   const dx=(to.lng-from.lng)*lonMeter/len,dy=(to.lat-from.lat)*latMeter/len;
   const gx=Math.floor(x/bin),gy=Math.floor(y/bin);
   let candidate=null,score=Infinity;
   for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){
     for(const idx of cells.get((gx+ox)+','+(gy+oy))||[]){
      const z=zones[idx],dist=Math.hypot(x-z.x,y-z.y);
      // Parallel or opposite lanes both count; crossing streets do not.
      const parallel=Math.abs(dx*z.dx+dy*z.dy);
      if(dist<threshold&&parallel>.88&&dist+(1-parallel)*35<score){
       candidate=z;score=dist+(1-parallel)*35;
      }
     }
   }
   const at=Number.isFinite(to.time)?to.time:null;
   let zone;
   if(!candidate){
     zone={x,y,dx,dy,visits:[{time:at,distance:cumulative}],segments:[]};
     const idx=zones.push(zone)-1,key=gx+','+gy;
     if(!cells.has(key))cells.set(key,[]);
     cells.get(key).push(idx);
   }else{
     zone=candidate;
     const farEnough=at!=null&&zone.visits.every(v=>v.time!=null&&Math.abs(at-v.time)>120000&&Math.abs(cumulative-v.distance)>160);
     if(farEnough)zone.visits.push({time:at,distance:cumulative});
   }
   zone.segments.push({group:g,index:i,from,to});
  }
 }
 // Multiple observations in the same location during a single visit are one pass.
 for(const zone of zones){
   const count=Math.min(4,zone.visits.length);
   if(count<2)continue;
   for(const seg of zone.segments)rails.push({...seg,count});
 }
 return rails.sort((a,b)=>a.group-b.group||a.index-b.index);
}
function rs43DrawRails(L,layer,rails){
 if(!Array.isArray(rails)||!rails.length)return;
 const runs=[];let current=null;
 // Keep layers cheap: join only consecutive matched route sections.
 for(const rail of rails){
  if(current&&current.group===rail.group&&current.lastIndex+1===rail.index&&current.count===rail.count){
    current.points.push([rail.to.lat,rail.to.lng]);current.lastIndex=rail.index;
  }else{current={group:rail.group,lastIndex:rail.index,count:rail.count,points:[[rail.from.lat,rail.from.lng],[rail.to.lat,rail.to.lng]]};runs.push(current);}
 }
 for(const run of runs){
  const line=run.points,passes=Math.min(4,run.count);
  for(let level=passes-1;level>=1;level--){
   const width=9+6*level;
   L.polyline(line,{color:'#ff9a50',weight:width,opacity:.92,interactive:false,lineCap:'round',lineJoin:'round',smoothFactor:0}).addTo(layer);
   if(level>1)L.polyline(line,{color:'#fff7f0',weight:width-3,opacity:.98,interactive:false,lineCap:'round',lineJoin:'round',smoothFactor:0}).addTo(layer);
  }
 }
}