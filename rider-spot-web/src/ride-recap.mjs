import { buildDailyTimeline } from "./daily-timeline.mjs";
import { financeTotals } from "./finance-model.mjs";
import { loadRideRecapBasemap } from "./ride-recap-map.mjs";

const formats = new Intl.NumberFormat("ko-KR");
const won = value => Number.isFinite(value) ? formats.format(Math.round(value)) + "원" : "미입력";
const numeric = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const ms = value => {
  const time = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

// Distance belongs to physical GPS fixes, never export viewport pixels.
export function recapDistanceMeters(a,b) {
  if(!a||!b)return null;
  const lat1=Number(a.lat),lng1=Number(a.lng),lat2=Number(b.lat),lng2=Number(b.lng);
  if(![lat1,lng1,lat2,lng2].every(Number.isFinite))return null;
  const r=Math.PI/180,dLat=(lat2-lat1)*r,dLng=(lng2-lng1)*r;
  const q=Math.sin(dLat/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dLng/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(q)));
}

// Read-only export filtering. Never connect trips, explicit recording breaks,
// 120-second gaps or implausible GPS leaps across known real timestamps.
// No points are interpolated, changed or written back to the original history.
export function recapRouteSegments(trips) {
  const segments=[];
  for(const trip of trips||[]) {
    let current=[],previous=null,previousTime=null;
    const flush=()=>{if(current.length)segments.push(current);current=[];};
    for(const sample of Array.isArray(trip?.points)?trip.points:[]) {
      const lat=Number(sample?.lat),lng=Number(sample?.lng);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||
        Math.abs(lat)>90||Math.abs(lng)>180||(lat===0&&lng===0)) {
        flush();previous=null;previousTime=null;continue;
      }
      const at=ms(sample?.t);
      const distance=previous?recapDistanceMeters(previous,{lat,lng}):0;
      const elapsed=previousTime!==null&&at!==null?at-previousTime:null;
      const trustworthyClock=at!==null&&previousTime!==null&&
        at>=100000000000&&previousTime>=100000000000;
      const gpsSpike=trustworthyClock&&elapsed>0&&
        distance>Math.max(150,elapsed/1000*55);
      const recordingGap=elapsed!==null&&(elapsed>120000||elapsed<0);
      if(sample?.break||recordingGap||gpsSpike)flush();
      current.push({lat,lng});
      previous={lat,lng};
      previousTime=at;
    }
    flush();
  }
  return segments;
}

export function buildRecapSnapshot(history, day, finance = null) {
  const daily = buildDailyTimeline(history, day);
  const trips = daily?.trips || [];
  const sums = finance ? financeTotals(finance, day, day) : null;
  const hasEarnings = !!sums?.earnings?.length;
  return {
    day, trips: trips.length, distanceKm: daily?.distanceKm || 0,
    durationMs: daily?.durationMs || 0,
    isLive: trips.some(trip => !trip.ended_at),
    segments: recapRouteSegments(trips),
    gross: hasEarnings ? sums.gross : null,
    cost: sums ? sums.cost : null,
    // Missing expense fields are not an explicitly recorded zero-cost day.
    costKnown: !!(hasEarnings && sums.earnings.every(row=>row.expense_scope==="other_only" &&
      row.expenses_won!==null && row.expenses_won!==undefined)),
    net: hasEarnings && !sums.uncertain ? sums.net : null,
    uncertain: !!sums?.uncertain,
    deliveries: hasEarnings && sums.deliveries > 0 ? sums.deliveries : null,
    platforms: Object.entries(sums?.byPlatform || {}).sort((a,b) => b[1]-a[1]),
    financeLoaded: !!finance,
  };
}

export async function fetchRecapFinance(client, userId, day) {
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error("유효하지 않은 결산 날짜입니다.");
  const defs = [
    ["rider_earnings", "work_date"],
    ["rider_fuel_logs", "fueled_on"],
    ["maintenance_logs", "serviced_on"],
    ["rider_extra_expenses", "expense_date"],
  ];
  const result = await Promise.all(defs.map(async ([table, date]) => {
    const response = await client.from(table).select("*").eq("user_id", userId).eq(date, day);
    if (response.error) throw response.error;
    return response.data || [];
  }));
  return {earnings:result[0], fuel:result[1], maintenance:result[2], extras:result[3]};
}

const palettes = {
  light: {bg:"#F7F8F6", ink:"#203844", muted:"#73848D", panel:"#FFFFFF", grid:"#D9E1E3", accent:"#4568F3", tint:"#EDF2F0", lime:"#C6EA87"},
  mist: {bg:"#E7EDEF", ink:"#203543", muted:"#627782", panel:"#F7FAF9", grid:"#D3DFE3", accent:"#3568ED", tint:"#DBE6E9", lime:"#C5E88B"},
  night: {bg:"#283944", ink:"#F2F5F4", muted:"#B5C4C9", panel:"#394C55", grid:"#51616A", accent:"#B5D2FE", tint:"#324650", lime:"#D1EC98"},
};
const fontFamily = '"Pretendard","Noto Sans KR","Apple SD Gothic Neo",system-ui,sans-serif';

function rounded(ctx,x,y,w,h,r,color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x,y,w,h,Math.min(r,w/2,h/2));
  ctx.fill();
}
function line(ctx,x1,y1,x2,y2,color,width=2) {
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();
  ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
}
function label(ctx,value,x,y,size=24,color="#65747B",weight=500,align="left") {
  ctx.font=weight+" "+size+"px "+fontFamily;
  ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline="alphabetic";
  ctx.fillText(String(value),x,y);
}
function km(n){ return numeric(n).toFixed(1)+" km"; }
function duration(millis) {
  const minutes=Math.round(numeric(millis)/60000);
  if(!minutes)return "기록 없음";
  const hours=Math.floor(minutes/60),rest=minutes%60;
  return (hours?hours+"시간 ":"")+rest+"분";
}
function abbreviatedMoney(n) { return n === null ? "미입력" : "₩"+formats.format(Math.round(n)); }
export function recapMapDimensions(mode,ratio) {
  if(mode==="finance")return null;
  // 4:5 editorial poster: exact MapLibre + Canvas raster pixel geometry.
  if(mode==="all"&&ratio==="4:5")return {width:936,height:744};
  const height=ratio==="9:16"?1920:ratio==="1:1"?1080:1350;
  return {width:936,height:Math.round(mode==="route"?Math.min(height*53/100,900):Math.min(height*35/100,720))};
}
export function recapEndpointLayout(paths,w,h,geoSegments=[]) {
  const visible=(paths||[]).filter(path=>Array.isArray(path)&&path.length);
  if(!visible.length)return null;
  const first=visible[0][0],last=visible.at(-1).at(-1);
  const real=(geoSegments||[]).filter(seg=>Array.isArray(seg)&&seg.length);
  const meters=real.length?recapDistanceMeters(real[0][0],real.at(-1).at(-1)):null;
  const coincident=meters!==null&&meters<=9;
  const margin=18, badgeH=35;
  const clamp=(v,a,b)=>Math.max(a,Math.min(v,b));
  const candidates=(pt,width)=>[
    {x:pt.x+23,y:pt.y-47},
    {x:pt.x-width-23,y:pt.y-47},
    {x:pt.x+23,y:pt.y+18},
    {x:pt.x-width-23,y:pt.y+18},
    {x:pt.x-width/2,y:pt.y-61},
    {x:pt.x-width/2,y:pt.y+26},
    {x:pt.x+23,y:pt.y+66},
    {x:pt.x-width-23,y:pt.y+66},
    {x:pt.x+23,y:pt.y-91},
    {x:pt.x-width-23,y:pt.y-91}
  ].map(v=>({x:clamp(v.x,margin,w-margin-width),
    y:clamp(v.y,margin,h-margin-badgeH),width,height:badgeH}));
  const intersect=(a,b,pad=6)=>a.x<b.x+b.width+pad&&
    a.x+a.width+pad>b.x&&a.y<b.y+b.height+pad&&a.y+a.height+pad>b.y;
  const pointBox=pt=>({x:pt.x-19,y:pt.y-19,width:38,height:38});
  // Favour quieter patches of the actual track when placing endpoint captions.
  // Only label rectangles move; the projected GPS coordinates never do.
  const routePoints=visible.flatMap(path=>{
    const step=Math.max(1,Math.ceil(path.length/180));
    return path.filter((_,index)=>index%step===0);
  });
  const score=(b,pt,other)=>{
    const nearOther=other&&intersect(b,pointBox(other),8)?10000:0;
    const nearPin=intersect(b,pointBox(pt),1)?1000:0;
    const routeHits=routePoints.reduce((sum,p)=>sum+
      (p.x>b.x-5&&p.x<b.x+b.width+5&&p.y>b.y-5&&p.y<b.y+b.height+5?1:0),0);
    return nearOther+nearPin+Math.min(1500,routeHits*100)+
      Math.hypot(b.x+b.width/2-pt.x,b.y+b.height/2-pt.y);
  };
  const pick=(pt,width,other,avoid=null)=>{
    const ranked=candidates(pt,width).map(b=>({b,s:score(b,pt,other)+(avoid&&intersect(b,avoid,8)?100000:0)}));
    ranked.sort((a,b)=>a.s-b.s);
    return ranked[0].b;
  };
  if(coincident){
    const joint=pick(first,144,null);
    return {first,last,start:null,end:null,joint,coincident,meters};
  }
  const start=pick(first,88,last);
  let end=pick(last,88,first,start);
  if(intersect(start,end,8)){
    // Keep coordinates fixed. Only the lightweight text label can move.
    const alternatives=candidates(last,88).filter(b=>!intersect(b,start,8));
    if(alternatives.length)end=alternatives.sort((a,b)=>score(a,last,first)-score(b,last,first))[0];
    if(intersect(start,end,8)) {
      // Extreme corners can collapse every nearby candidate to the same box.
      // Stack labels with a guaranteed 9px gap; never shift their GPS pins.
      const above=start.y-badgeH-9,below=start.y+badgeH+9;
      end={...end,x:start.x,y:above>=margin?above:below};
    }
  }
  return {first,last,start,end,joint:null,coincident,meters};
}


export function recapMapLabelVisible(place,positions,width,height) {
  if(!place||!Number.isFinite(place.x)||!Number.isFinite(place.y)||
    place.x<68||place.x>width-68||place.y<80||place.y>height-56)return false;
  const routes=(positions||[]).filter(path=>Array.isArray(path)&&path.length);
  const endpoints=routes.length?[routes[0][0],routes.at(-1).at(-1)]:[];
  // Korean dong text stays away from real start/end pins and their chip labels.
  return endpoints.every(pt=>Math.hypot(place.x-pt.x,place.y-pt.y)>=116);
}

function drawRoute(ctx,segments,x,y,w,h,p,showRoute,mapSnapshot=null) {
  rounded(ctx,x,y,w,h,13,p.tint);
  ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,13);ctx.clip();
  const actualMap=showRoute&&mapSnapshot?.hasBasemap&&mapSnapshot?.image;
  if(actualMap){
    ctx.drawImage(mapSnapshot.image,x,y,w,h);
    // Administrative labels are positioned using the same export-map viewport.
    for(const place of mapSnapshot.labels||[]){
      if(!recapMapLabelVisible(place,mapSnapshot.positions,w,h))continue;
      const px=x+place.x,py=y+place.y;
      ctx.save();
      ctx.font="600 22px "+fontFamily;
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.lineWidth=5;ctx.lineJoin="round";
      ctx.strokeStyle="rgba(255,255,255,.92)";
      ctx.strokeText(place.name,px,py);
      ctx.fillStyle="#536973";
      ctx.fillText(place.name,px,py);
      ctx.restore();
    }
  }
  const points=showRoute?segments.flat():[];
  if(!points.length){
    label(ctx,showRoute?"기록된 GPS 경로가 없어요":"경로 비공개",x+w/2,y+h/2,28,p.muted,610,"center");
  }else{
    const positions=actualMap?mapSnapshot.positions:null;
    let project;
    if(!positions){
      const midLat=points.reduce((sum,pt)=>sum+pt.lat,0)/points.length;
      const cos=Math.max(.1,Math.cos(midLat*Math.PI/180));
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(const pt of points){
        const px=pt.lng*cos,py=pt.lat;
        if(px<minX)minX=px;if(px>maxX)maxX=px;
        if(py<minY)minY=py;if(py>maxY)maxY=py;
      }
      const spanX=Math.max(maxX-minX,.00015),spanY=Math.max(maxY-minY,.00015);
      const scale=Math.min((w-120)/spanX,(h-120)/spanY);
      project=pt=>({x:w/2+(pt.lng*cos-(minX+maxX)/2)*scale,y:h/2-(pt.lat-(minY+maxY)/2)*scale});
    }
    const paths=positions||segments.map(segment=>segment.map(project));
    // A restrained two-pass vector stroke: readable over the muted street
    // basemap without the 8px+ blue spaghetti of the old export.
    for(const path of paths){
      if(!path.length)continue;
      const stride=Math.max(1,Math.ceil(path.length/1400));
      const sampled=path.filter((_,i)=>i%stride===0);
      if(sampled.at(-1)!==path.at(-1))sampled.push(path.at(-1));
      ctx.beginPath();
      sampled.forEach((pt,i)=>i?ctx.lineTo(x+pt.x,y+pt.y):ctx.moveTo(x+pt.x,y+pt.y));
      ctx.lineCap="round";ctx.lineJoin="round";
      ctx.strokeStyle="rgba(255,255,255,.92)";ctx.lineWidth=6.8;ctx.stroke();
      ctx.strokeStyle=p.accent;ctx.lineWidth=4.1;ctx.stroke();
    }
    const endpoints=recapEndpointLayout(paths,w,h,segments);
    if(endpoints){
      const {first,last,start,end,coincident}=endpoints;
      const pin=(pt,color,endPin=false,outerRing=false)=>{
        const cx=x+pt.x,cy=y+pt.y;
        ctx.beginPath();ctx.arc(cx,cy,outerRing?24:15,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();
        ctx.beginPath();ctx.arc(cx,cy,outerRing?20:11,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
        if(endPin)rounded(ctx,cx-3,cy-3,6,6,1,"#fff");
        else {ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();}
      };
      const badge=(rect,text,color)=>{
        const bx=x+rect.x,by=y+rect.y;
        rounded(ctx,bx,by,rect.width,rect.height,8,"rgba(255,255,255,.97)");
        ctx.beginPath();ctx.arc(bx+15,by+17.5,4,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
        label(ctx,text,bx+27,by+25,text.includes("·")?19:20,p.ink,650);
      };
      if(coincident){
        // Only physically coincident GPS fixes share a pin. This is a split
        // circular sign, not a fabricated new location or a map legend.
        const cx=x+first.x,cy=y+first.y;
        ctx.beginPath();ctx.arc(cx,cy,19,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();
        ctx.beginPath();ctx.arc(cx,cy,15,Math.PI/2,Math.PI*3/2);ctx.fillStyle=p.accent;ctx.fill();
        ctx.beginPath();ctx.arc(cx,cy,15,-Math.PI/2,Math.PI/2);ctx.fillStyle=p.ink;ctx.fill();
        ctx.beginPath();ctx.arc(cx,cy,4,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();
        badge(endpoints.joint,"출발·종료",p.accent);
      }else{
        // At wide map zoom two genuinely different GPS fixes may project to
        // almost the same pixel. Keep both pins at their real coordinates:
        // a wider blue start ring makes the lower marker discernible.
        const projectedAdjacent=Math.hypot(first.x-last.x,first.y-last.y)<34;
        pin(first,p.accent,false,projectedAdjacent);
        pin(last,p.ink,true);
        badge(start,"출발",p.accent);
        badge(end,"종료",p.ink);
      }

    }
  }
  if(actualMap){
    // Map source credits must remain legible on exported imagery.
    rounded(ctx,x+w-335,y+h-27,320,20,4,"rgba(255,255,255,.88)");
    label(ctx,"© OpenFreeMap · © OpenStreetMap contributors",x+w-20,y+h-12,12,"#566B73",520,"right");
  }
  ctx.restore();
}
// A single card, rendered into the actual export PNG (not a CSS preview).
// The map and the bottom ledger share one clipped, elevated journal surface.
// The PNG is the shareable artwork itself, never a fake card on a mockup.
function premiumJournalSurface(ctx,p) {
  rounded(ctx,0,0,1080,1350,0,"#F7F8F6");
  rounded(ctx,0,974,1080,376,0,"#F2F5F3");
  line(ctx,72,974,1008,974,"#D7E0DF",1.5);
}
function premiumJournalBrand(ctx,p) {
  rounded(ctx,72,42,31,31,8,p.accent);
  ctx.beginPath();ctx.moveTo(80,63);ctx.lineTo(88,53);ctx.lineTo(96,59);
  ctx.strokeStyle="#FFFFFF";ctx.lineWidth=2.6;ctx.lineCap="round";
  ctx.lineJoin="round";ctx.stroke();
  for(const [xx,yy] of [[80,63],[96,59]]) {
    ctx.beginPath();ctx.arc(xx,yy,2.5,0,Math.PI*2);
    ctx.fillStyle="#FFFFFF";ctx.fill();
  }
  label(ctx,"라이더스팟",114,66,20,p.ink,770);
  label(ctx,"RIDE JOURNAL",1008,65,16,p.muted,620,"right");
}
function recapCalendar(day) {
  const match=/^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(day||"");
  if(!match)return {title:String(day||"기록").replace(/-/g,"."),meta:"이동 기록"};
  const [,year,month,date]=match;
  const when=new Date(day+"T12:00:00+09:00");
  const weekday=Number.isNaN(when.getTime())?"":("일월화수목금토"[when.getUTCDay()]+"요일");
  return {title:Number(month)+"월 "+Number(date)+"일의 기록",
    meta:year+(weekday?" · "+weekday:"")};
}
function fitRecapLabel(ctx,value,x,y,maxWidth,size,minSize,color,weight,align="left") {
  const text=String(value);
  if(typeof ctx.measureText==="function") {
    while(size>minSize) {
      ctx.font=weight+" "+size+"px "+fontFamily;
      if(ctx.measureText(text).width<=maxWidth)break;
      size-=2;
    }
  } else size=Math.min(size,Math.max(minSize,Math.floor(maxWidth/(Math.max(1,text.length)*.62))));
  label(ctx,text,x,y,Math.max(minSize,size),color,weight,align);
}
function stat(ctx,title,value,x,y,w,p) {
  label(ctx,title,x,y,23,p.muted,600);
  label(ctx,value,x,y+60,36,p.ink,750);
}
 
// Pure Canvas 2D export, not a screenshot of the live map. No external images,
// remote font requests or cross-origin tiles: PNG export cannot be tainted.
export function renderRecapCanvas(canvas,recap,{mode="all",ratio="4:5",theme="light",showRoute=true,showIncome=true,mapSnapshot=null}={}) {
  const H=ratio==="9:16"?1920:ratio==="1:1"?1080:1350,W=1080;
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("이미지 렌더링을 사용할 수 없어요.");
  const p=palettes[theme]||palettes.light;
  rounded(ctx,0,0,W,H,0,p.bg);
  if(mode==="all"&&ratio==="4:5"){
    premiumJournalSurface(ctx,p);
    premiumJournalBrand(ctx,p);
    const calendar=recapCalendar(recap.day);
    label(ctx,calendar.title,72,158,57,p.ink,790);
    label(ctx,calendar.meta,1008,155,20,p.muted,580,"right");
  }else{
    rounded(ctx,72,66,12,12,3,p.accent);
    label(ctx,"라이더스팟",97,80,22,p.ink,780);
    label(ctx,recap.day.replace(/-/g,".")+(mode==="finance"?" 결산":" 타임라인"),72,151,48,p.ink,800);
  }
  const income=showIncome?abbreviatedMoney(recap.gross):"비공개";
  if(mode==="finance") {
    label(ctx,"하루 수익",72,246,27,p.muted,700);
    label(ctx,income,72,346,80,p.ink,800);
    rounded(ctx,72,420,936,H-594,32,p.panel);
    label(ctx,"상세 결산",116,482,25,p.muted,700);
    const rows=[
      ["총수익",income],
      ["업무 비용",showIncome&&recap.financeLoaded?won(recap.cost):"비공개"],
      ["비용 차감 후",!showIncome?"비공개":recap.uncertain?"확인 필요":abbreviatedMoney(recap.net)],
      ...(recap.deliveries===null?[]:[["배달 건수",recap.deliveries+"건"]]),
      ["운행 거리",recap.trips?km(recap.distanceKm):"기록 없음"],
    ];
    const spacing=Math.min(121,(H-690)/rows.length);
    rows.forEach(([name,value],i)=>{
      const y=550+i*spacing;
      label(ctx,name,116,y,26,p.muted,550);
      label(ctx,value,964,y,32,p.ink,700,"right");
      if(i<rows.length-1)line(ctx,116,y+30,964,y+30,p.grid,2);
    });
    const breakdownBottom=550+rows.length*spacing;
    if(showIncome && recap.platforms.length && breakdownBottom+110<H-135) {
      label(ctx,"플랫폼별 수익",116,breakdownBottom+42,22,p.muted,700);
      let cursor=116;
      const sum=recap.platforms.reduce((a,part)=>a+part[1],0);
      for(const [i,[name,value]] of recap.platforms.slice(0,3).entries()) {
        const part=Math.max(3,848*(value/Math.max(1,sum)));
        rounded(ctx,cursor,breakdownBottom+67,Math.min(part,964-cursor),14,7,[p.accent,p.lime,p.muted][i]);
        cursor+=part+5;
      }
    }
  } else if(mode==="all" && ratio==="4:5") {
    const {width:mapWidth,height:mapHeight}=recapMapDimensions(mode,ratio);
    const left=72,right=1008,top=202;
    drawRoute(ctx,recap.segments,left,top,mapWidth,mapHeight,p,showRoute,mapSnapshot);
    // One restrained boundary identifies the actual route map. No drop shadow.
    ctx.beginPath();ctx.roundRect(left+.5,top+.5,mapWidth-1,mapHeight-1,13);
    ctx.strokeStyle="rgba(32,56,68,.13)";ctx.lineWidth=1;ctx.stroke();
    const hasIncome=showIncome&&Number.isFinite(recap.gross);
    const hasNet=hasIncome&&recap.financeLoaded&&recap.costKnown&&
      !recap.uncertain&&recap.cost>0&&Number.isFinite(recap.net);
    rounded(ctx,left,1006,32,4,2,p.accent);
    label(ctx,hasIncome?"오늘의 결산":"운행 요약",left,1045,24,p.ink,760);
    if(hasIncome&&recap.trips>0)
      label(ctx,recap.trips+"회 운행",right,1043,20,p.muted,600,"right");
    if(hasIncome) {
      label(ctx,"총수익",left,1101,20,p.muted,600);
      fitRecapLabel(ctx,abbreviatedMoney(recap.gross),left,1178,
        hasNet?620:790,68,37,p.ink,790);
      if(hasNet) {
        label(ctx,"비용 차감 후",right,1102,18,p.muted,550,"right");
        fitRecapLabel(ctx,abbreviatedMoney(recap.net),right,1150,290,33,21,p.ink,720,"right");
        label(ctx,"기록 비용 "+won(recap.cost),right,1179,17,p.muted,510,"right");
      } else if(!recap.costKnown||recap.uncertain) {
        label(ctx,"비용 미확정",right,1171,17,p.muted,530,"right");
      }
      line(ctx,left,1213,right,1213,p.grid,1.5);
      const stats=[
        ["운행거리",recap.trips?km(recap.distanceKm):"기록 없음"],
        ["운행시간",recap.trips?duration(recap.durationMs):"기록 없음"],
      ];
      if(recap.deliveries!==null&&recap.deliveries!==undefined)
        stats.push(["배달 건수",recap.deliveries+"건"]);
      const col=mapWidth/stats.length;
      stats.forEach(([name,value],i)=>{
        const x=left+i*col+(i?23:0);
        if(i)line(ctx,left+i*col,1230,left+i*col,1310,p.grid,1.5);
        label(ctx,name,x,1258,19,p.muted,570);
        fitRecapLabel(ctx,value,x,1303,col-42,38,23,p.ink,750);
      });
    } else {
      // Without disclosed earnings, use the entire ledger for real ride data.
      line(ctx,left,1070,right,1070,p.grid,1.5);
      label(ctx,"총 운행거리",left,1120,20,p.muted,600);
      fitRecapLabel(ctx,recap.trips?km(recap.distanceKm):"기록 없음",
        left,1200,500,66,37,p.ink,780);
      label(ctx,"운행시간",602,1120,20,p.muted,600);
      fitRecapLabel(ctx,recap.trips?duration(recap.durationMs):"기록 없음",
        602,1194,406,43,25,p.ink,740);
      line(ctx,left,1233,right,1233,p.grid,1.5);
      label(ctx,"기록된 운행",left,1289,20,p.muted,600);
      label(ctx,recap.trips+"회"+(recap.isLive?" · 진행 중":""),right,1292,28,p.ink,730,"right");
    }

  } else {
    const mapTop=207;
    const mapHeight=recapMapDimensions(mode,ratio).height;
    drawRoute(ctx,recap.segments,72,mapTop,936,mapHeight,p,showRoute,mapSnapshot);
    const panelTop=mapTop+mapHeight+28;
    const panelHeight=H-panelTop-147;
    rounded(ctx,72,panelTop,936,panelHeight,30,p.panel);
    if(mode==="route") {
      label(ctx,"주행 기록",112,panelTop+57,24,p.muted,700);
      stat(ctx,"운행거리",recap.trips?km(recap.distanceKm):"기록 없음",112,panelTop+120,0,p);
      stat(ctx,"기록시간",duration(recap.durationMs),588,panelTop+120,0,p);
      if(panelHeight>260) {
        line(ctx,112,panelTop+222,968,panelTop+222,p.grid);
        label(ctx,"저장된 운행",112,panelTop+277,23,p.muted,600);
        label(ctx,recap.trips+"회"+(recap.isLive?" · 운행 중":""),968,panelTop+277,28,p.ink,750,"right");
      }
    } else {
      label(ctx,"하루 수익",112,panelTop+58,23,p.muted,700);
      label(ctx,income,112,panelTop+146,64,p.ink,800);
      line(ctx,112,panelTop+184,968,panelTop+184,p.grid,2);
      const metricY=panelTop+233;
      stat(ctx,"거리",recap.trips?km(recap.distanceKm):"기록 없음",112,metricY,0,p);
      stat(ctx,"시간",duration(recap.durationMs),438,metricY,0,p);
      if(recap.deliveries!==null)stat(ctx,"배달",recap.deliveries+"건",764,metricY,0,p);
      if(panelHeight>378) {
        line(ctx,112,panelTop+337,968,panelTop+337,p.grid,2);
        label(ctx,"업무 비용",112,panelTop+394,24,p.muted,600);
        label(ctx,!showIncome?"비공개":recap.financeLoaded?won(recap.cost):"미입력",968,panelTop+394,27,p.ink,700,"right");
      }
      if(panelHeight>454) {
        label(ctx,"비용 차감 후",112,panelTop+464,24,p.muted,600);
        label(ctx,!showIncome?"비공개":recap.uncertain?"확인 필요":abbreviatedMoney(recap.net),968,panelTop+464,27,p.ink,700,"right");
      }
    }
  }
  return canvas;
}
const dimensions = ratio => ratio==="9:16"?"1080 × 1920":ratio==="1:1"?"1080 × 1080":"1080 × 1350";
const button = (h,label,onClick,cls,props={})=>h("button",{type:"button",className:cls,onClick,...props},label);

export function createRideRecap(React,client) {
  const h=React.createElement;
  function RideRecap({day,history=[],user,financeData=null,onClose,notify}) {
    // An intentional single-layout export: fewer options, reliable previews.
    const mode="all", ratio="4:5", theme="light";
    const [showRoute,setShowRoute]=React.useState(true);
    const [showIncome,setShowIncome]=React.useState(true);
    const [remote,setRemote]=React.useState(null);
    const [loadError,setLoadError]=React.useState("");
    const [saving,setSaving]=React.useState(false);
    const [renderError,setRenderError]=React.useState(false);
    const saveBusyRef=React.useRef(false);
    const [mapState,setMapState]=React.useState({key:null,status:"idle",snapshot:null,error:null});
    const [mapRetry,setMapRetry]=React.useState(0);
    const [message,setMessage]=React.useState("");
    const preview=React.useRef(null);
    const dialogRef=React.useRef(null);
    const closeRef=React.useRef(onClose);closeRef.current=onClose;
    React.useLayoutEffect(()=>{
      const dialog=dialogRef.current;
      if(!dialog)return;
      // Native dialog top layer escapes transformed map/card ancestors,
      // unlike position:fixed inside the timeline page.
      if(!dialog.open)dialog.showModal();
      return()=>{if(dialog.open)dialog.close();};
    },[]);
    React.useEffect(()=>{
      const unregister=window.__rsNavigation?.registerLayer("ride-recap",()=>{closeRef.current();return true;});
      return ()=>unregister?.();
    },[]);
    React.useEffect(()=>{
      if(!user?.id || financeData) {setRemote(null);setLoadError("");return;}
      let active=true;
      setRemote(null);setLoadError("");
      fetchRecapFinance(client,user.id,day).then(result=>{
        if(active)setRemote({userId:user.id,day,data:result});
      }).catch(error=>{if(active)setLoadError(error.message||"결산을 불러올 수 없어요.");});
      return ()=>{active=false;};
    },[user?.id,day,financeData]);
    const finance=user?.id && financeData ? financeData :
      remote?.userId===user?.id && remote?.day===day ? remote.data : null;
    const loading=!!user?.id && !financeData && !finance && !loadError;
    const recap=React.useMemo(()=>buildRecapSnapshot(history,day,finance),[history,day,finance]);
    const mapSize=recapMapDimensions(mode,ratio);
    const hasTrack=recap.segments.some(segment=>segment.length);
    const activeKey=showRoute&&mapSize&&hasTrack
      ? day+"|"+mode+"|"+ratio+"|"+recap.segments.reduce((sum,part)=>sum+part.length,0)+"|"+mapRetry
      : null;
    React.useEffect(()=>{
      if(!activeKey){setMapState({key:null,status:"idle",snapshot:null,error:null});return;}
      let active=true;
      const controller=new AbortController();
      setMapState({key:activeKey,status:"loading",snapshot:null,error:null});
      loadRideRecapBasemap(recap.segments,{...mapSize,signal:controller.signal})
        .then(snapshot=>{
          if(active)setMapState({key:activeKey,status:"ready",snapshot,error:null});
        })
        .catch(error=>{
          if(active && error?.name!=="AbortError")
            setMapState({key:activeKey,status:"error",snapshot:null,
              error:error?.message||"지도를 불러오지 못했어요."});
        });
      return()=>{active=false;controller.abort();};
    },[activeKey]);
    const mapLoading=!!activeKey && (mapState.key!==activeKey||mapState.status==="loading");
    const mapFailed=!!activeKey && mapState.key===activeKey&&mapState.status==="error";
    const mapSnapshot=activeKey&&mapState.key===activeKey&&mapState.status==="ready"
      ?mapState.snapshot:null;
    React.useEffect(()=>{
      if(!preview.current)return;
      try{renderRecapCanvas(preview.current,recap,{mode,ratio,theme,showRoute,showIncome,mapSnapshot});setRenderError(false);setMessage("");}
      catch(error){setRenderError(true);setMessage("이미지 미리보기를 만들지 못했어요.");}
    },[recap,mode,ratio,theme,showRoute,showIncome,mapSnapshot]);
    const toPng=()=>new Promise((resolve,reject)=>{
      const canvas=document.createElement("canvas");
      renderRecapCanvas(canvas,recap,{mode,ratio,theme,showRoute,showIncome,mapSnapshot});
      canvas.toBlob(blob=>blob?resolve(blob):reject(Error("PNG 이미지 생성에 실패했어요.")),"image/png");
    });
    const fileName="riderspot-"+day+"-"+mode+".png";
    const save=async(share=false)=>{
      if(saveBusyRef.current || saving || loading || mapLoading || mapFailed || renderError)return;
      saveBusyRef.current=true;setSaving(true);setMessage("");
      try{
        const blob=await toPng();
        if(share) {
          const file=new File([blob],fileName,{type:"image/png"});
          if(!navigator.share || !navigator.canShare?.({files:[file]})) {
            setMessage("이 환경에서는 직접 공유가 지원되지 않아요. 이미지 저장을 이용해 주세요.");
            return;
          }
          await navigator.share({files:[file],title:"라이더스팟 · "+day});
          return;
        }
        if(typeof window.__rsNativeSaveImage==="function") {
          const base64=await new Promise((resolve,reject)=>{
            const reader=new FileReader();
            reader.onerror=()=>reject(Error("PNG 파일을 읽을 수 없어요."));
            reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");
            reader.readAsDataURL(blob);
          });
          const answer=await window.__rsNativeSaveImage(base64,fileName);
          if(answer?.saved!==true)throw Error("갤러리 저장을 확인하지 못했어요.");
          setMessage("갤러리의 사진 > RiderSpot 앨범에 저장했어요.");
          return;
        }
        if(window.__rsNativeInstalled) {
          setMessage("이 APK에서는 이미지 저장을 지원하지 않아요. APK 업데이트가 필요합니다. 임시로 모바일 Chrome에서 라이더스팟을 열어 저장할 수 있어요.");
          return;
        }
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");
        a.href=url;a.download=fileName;a.style.display="none";
        document.body.appendChild(a);a.click();a.remove();
        window.setTimeout(()=>URL.revokeObjectURL(url),60000);
        setMessage("PNG 다운로드를 요청했어요. 브라우저의 다운로드 폴더를 확인해 주세요.");
      }catch(error){
        if(error?.name!=="AbortError")setMessage(error?.message||"이미지를 저장할 수 없어요.");
      }finally{saveBusyRef.current=false;setSaving(false);}
    };
    return h("dialog",{
        ref:dialogRef,className:"rs-recap-dialog",role:"dialog",
        "aria-modal":true,"aria-label":"라이딩 이미지 저장",
        onCancel:event=>{event.preventDefault();closeRef.current();}
      },
      h("div",{className:"rs-recap-sheet"},
        h("header",{className:"rs-recap-head"},
          h("div",{className:"rs-recap-title"},
            h("small",null,day.replace(/-/g,".")+" · 라이딩 리포트"),
            h("h2",null,"이미지 저장")),
          button(h,"×",onClose,"rs-recap-close",{"aria-label":"닫기"})),
        h("div",{className:"rs-recap-content"},
          h("div",{className:"rs-recap-preview"},
            h("canvas",{ref:preview,role:"img","aria-label":day+" 라이딩 이미지 미리보기"})),
          mapLoading?h("p",{className:"rs-recap-state",role:"status"},"주행 지도와 동 이름을 불러오는 중…"):null,
          mapFailed?h("div",{className:"rs-recap-map-error",role:"alert"},
            h("span",null,mapState.error||"지도를 불러오지 못했어요."),
            button(h,"다시 불러오기",()=>setMapRetry(value=>value+1),"rs-recap-map-retry")):null,
          loading?h("p",{className:"rs-recap-state",role:"status"},"결산 기록을 불러오는 중…"):
            loadError?h("p",{className:"rs-recap-state",role:"alert"},"결산 조회 실패 · "+loadError+" (수익 없이 저장 가능)"):null,
          h("label",{className:"rs-recap-toggle rs-recap-route"},
            h("span",null,
              h("strong",null,"경로 공개"),
              h("small",null,"공유용 이미지에 실제 이동 경로 표시")),
            h("input",{type:"checkbox",checked:showRoute,onChange:e=>setShowRoute(e.target.checked),"aria-label":"경로 공개"}),
            h("span",{className:"rs-recap-switch","aria-hidden":true})),
          h("label",{className:"rs-recap-toggle rs-recap-income"},
            h("span",null,
              h("strong",null,"수익 공개"),
              h("small",null,"공유용 이미지에 수익 금액 표시")),
            h("input",{type:"checkbox",checked:showIncome,onChange:e=>setShowIncome(e.target.checked),"aria-label":"수익 공개"}),
            h("span",{className:"rs-recap-switch","aria-hidden":true})),
          message&&h("p",{className:"rs-recap-state",role:"status"},message)),
        h("footer",{className:"rs-recap-actions"},
          button(h,"공유하기",()=>save(true),"rs-recap-share",{disabled:saving||loading||mapLoading||mapFailed||renderError}),
          button(h,saving?"저장하는 중…":"PNG 저장",()=>save(false),"rs-recap-download",{disabled:saving||loading||mapLoading||mapFailed||renderError}))));

  }
  return RideRecap;
}
