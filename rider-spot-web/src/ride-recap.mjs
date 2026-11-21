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

// Preserve every original ride boundary, GPS break and long recording gap.
// A trace is only rendered between samples that were actually adjacent.
export function recapRouteSegments(trips) {
  const segments = [];
  for (const trip of trips || []) {
    let current = [], previousTime = null;
    const flush = () => { if (current.length) segments.push(current); current = []; };
    for (const sample of Array.isArray(trip?.points) ? trip.points : []) {
      const lat = Number(sample?.lat), lng = Number(sample?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
          Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
        flush(); previousTime = null; continue;
      }
      const at = ms(sample?.t);
      if (sample?.break || (at !== null && previousTime !== null && at - previousTime > 120000)) flush();
      current.push({lat, lng});
      if (at !== null) previousTime = at;
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
  light: {bg:"#F4F4F0", ink:"#273743", muted:"#65747B", panel:"#FFFFFF", grid:"#E3E8E8", accent:"#416CF2", tint:"#E9EDF0", lime:"#C6EA87"},
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
  // 4:5 poster: a true square, 800 x 800 GPS map and a compact receipt below.
  if(mode==="all"&&ratio==="4:5")return {width:920,height:920};
  const height=ratio==="9:16"?1920:ratio==="1:1"?1080:1350;
  return {width:936,height:Math.round(mode==="route"?Math.min(height*53/100,900):Math.min(height*35/100,720))};
}
export function recapEndpointLayout(paths,w,h) {
  const pathsWithPoints=(paths||[]).filter(path=>Array.isArray(path)&&path.length);
  if(!pathsWithPoints.length)return null;
  const first=pathsWithPoints[0][0],last=pathsWithPoints.at(-1).at(-1);
  const coincident=Math.hypot(first.x-last.x,first.y-last.y)<58;
  const badgeW=68,badgeH=28,gutter=10;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const badge=(pt,dx,dy)=>({
    x:clamp(pt.x+dx,gutter,w-badgeW-gutter),
    y:clamp(pt.y+dy,gutter,h-badgeH-gutter),
    width:badgeW,height:badgeH
  });
  let start=badge(first,-82,-37),end=badge(last,14,11);
  const overlap=(a,b)=>a.x<b.x+b.width+6&&b.x<a.x+a.width+6&&a.y<b.y+b.height+6&&b.y<a.y+a.height+6;
  if(overlap(start,end)){
    end=badge(last,16,40);
    if(overlap(start,end))start=badge(first,-82,-65);
    if(overlap(start,end)){
      start={...start,x:gutter};
      end={...end,x:w-badgeW-gutter};
    }
  }
  return {first,last,start,end,coincident};
}
function drawRoute(ctx,segments,x,y,w,h,p,showRoute,mapSnapshot=null) {
  rounded(ctx,x,y,w,h,19,p.tint);
  ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,19);ctx.clip();
  const actualMap=showRoute&&mapSnapshot?.hasBasemap&&mapSnapshot?.image;
  if(actualMap){
    ctx.drawImage(mapSnapshot.image,x,y,w,h);
    // Administrative labels are positioned using the same export-map viewport.
    for(const place of mapSnapshot.labels||[]){
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
      ctx.strokeStyle="rgba(255,255,255,.72)";ctx.lineWidth=9;ctx.stroke();
      ctx.strokeStyle=p.accent;ctx.lineWidth=5.25;ctx.stroke();
    }
    const endpoints=recapEndpointLayout(paths,w,h);
    if(endpoints){
      const {first,last,start,end,coincident}=endpoints;
      const pin=(pt,color,endPin=false)=>{
        const cx=x+pt.x,cy=y+pt.y;
        ctx.beginPath();ctx.arc(cx,cy,11,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();
        ctx.beginPath();ctx.arc(cx,cy,7.2,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
        if(endPin)rounded(ctx,cx-2.5,cy-2.5,5,5,1,"#fff");
        else {ctx.beginPath();ctx.arc(cx,cy,2.4,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();}
      };
      const badge=(rect,text,color)=>{
        const bx=x+rect.x,by=y+rect.y;
        rounded(ctx,bx,by,rect.width,rect.height,9,"rgba(255,255,255,.94)");
        ctx.beginPath();ctx.arc(bx+12,by+14,3.2,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
        label(ctx,text,bx+23,by+20,17,p.ink,700);
      };
      if(coincident){
        // Preserve the true GPS endpoints: a split blue/slate ring shows
        // a near-roundtrip without two floating labels obscuring each other.
        const cx=x+(first.x+last.x)/2,cy=y+(first.y+last.y)/2;
        ctx.beginPath();ctx.arc(cx,cy,13,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();
        ctx.beginPath();ctx.arc(cx,cy,9,Math.PI/2,Math.PI*3/2);ctx.fillStyle=p.accent;ctx.fill();
        ctx.beginPath();ctx.arc(cx,cy,9,-Math.PI/2,Math.PI/2);ctx.fillStyle=p.ink;ctx.fill();
      }else{
        pin(first,p.accent);pin(last,p.ink,true);
        badge(start,"출발",p.accent);
        badge(end,"종료",p.ink);
      }
      // Slim editorial legend replaces the prominent "주행 경로" badge.
      rounded(ctx,x+18,y+18,coincident?223:186,34,11,"rgba(255,255,255,.92)");
      ctx.beginPath();ctx.arc(x+34,y+35,4.5,0,Math.PI*2);ctx.fillStyle=p.accent;ctx.fill();
      label(ctx,"출발",x+45,y+42,17,p.ink,660);
      ctx.beginPath();ctx.arc(x+109,y+35,4.5,0,Math.PI*2);ctx.fillStyle=p.ink;ctx.fill();
      label(ctx,coincident?"종료 · 인접":"종료",x+120,y+42,17,p.ink,660);
    }
  }
  if(actualMap){
    // Map source credits must remain legible on exported imagery.
    rounded(ctx,x+w-293,y+h-27,279,20,5,"rgba(255,255,255,.86)");
    label(ctx,"© OpenMapTiles · © OpenStreetMap",x+w-21,y+h-12,13,"#566B73",500,"right");
  }
  ctx.restore();
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
    rounded(ctx,80,53,10,10,3,p.accent);
    label(ctx,"라이더스팟",102,67,20,p.ink,780);
    label(ctx,"하루의 운행 기록",1000,67,17,p.muted,550,"right");
    label(ctx,recap.day.replace(/-/g,".")+" 타임라인",80,137,45,p.ink,800);
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
    // A genuinely square 920×920 map with a single aligned 920px ledger.
    // 1080×1350: 80px side margins, a 17px map/ledger gap, 27px bottom.
    const {width:side,height:mapHeight}=recapMapDimensions(mode,ratio);
    const mapLeft=80,mapTop=166;
    drawRoute(ctx,recap.segments,mapLeft,mapTop,side,mapHeight,p,showRoute,mapSnapshot);
    const cardX=80,cardY=1103,cardW=920,cardH=221;
    rounded(ctx,cardX,cardY,cardW,cardH,19,p.panel);
    const left=108,right=972;
    label(ctx,"오늘의 운행",left,cardY+29,21,p.ink,730);
    if(recap.trips>0)label(ctx,recap.trips+"회 운행",right,cardY+29,18,p.muted,575,"right");
    const showGross=showIncome&&recap.gross!==null;
    const incomeText=showIncome?(showGross?abbreviatedMoney(recap.gross):"수익 기록 없음"):"수익 비공개";
    const showNet=showGross&&recap.financeLoaded&&!recap.uncertain&&recap.cost>0&&recap.net!==null;
    label(ctx,showGross?"총수익":"수익",left,cardY+59,18,p.muted,590);
    label(ctx,incomeText,left,cardY+114,showGross?51:31,p.ink,800);
    // No repeated gross/net amount when expenses are zero.
    if(showNet){
      label(ctx,"순수익",right,cardY+64,18,p.muted,575,"right");
      label(ctx,abbreviatedMoney(recap.net),right,cardY+111,32,p.ink,740,"right");
      label(ctx,"비용 "+won(recap.cost),right,cardY+136,15,p.muted,550,"right");
    }else if(showGross&&recap.uncertain){
      label(ctx,"비용 확인 필요",right,cardY+101,17,p.muted,550,"right");
    }
    line(ctx,left,cardY+132,right,cardY+132,p.grid,1.5);
    const stats=[
      ["운행거리",recap.trips?km(recap.distanceKm):"기록 없음"],
      ["운행시간",recap.trips?duration(recap.durationMs):"기록 없음"]
    ];
    if(recap.deliveries!==null)stats.push(["배달",recap.deliveries+"건"]);
    const cell=864/stats.length;
    stats.forEach(([name,value],i)=>{
      const sx=left+i*cell;
      label(ctx,name,sx,cardY+159,18,p.muted,600);
      label(ctx,value,sx,cardY+198,29,p.ink,760);
    });
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
    const mode="all", ratio="4:5", theme="light", showRoute=true;
    const [showIncome,setShowIncome]=React.useState(true);
    const [remote,setRemote]=React.useState(null);
    const [loadError,setLoadError]=React.useState("");
    const [saving,setSaving]=React.useState(false);
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
      try{renderRecapCanvas(preview.current,recap,{mode,ratio,theme,showRoute,showIncome,mapSnapshot});setMessage("");}
      catch(error){setMessage("이미지 미리보기를 만들지 못했어요.");}
    },[recap,mode,ratio,theme,showRoute,showIncome,mapSnapshot]);
    const toPng=()=>new Promise((resolve,reject)=>{
      const canvas=document.createElement("canvas");
      renderRecapCanvas(canvas,recap,{mode,ratio,theme,showRoute,showIncome,mapSnapshot});
      canvas.toBlob(blob=>blob?resolve(blob):reject(Error("PNG 이미지 생성에 실패했어요.")),"image/png");
    });
    const fileName="riderspot-"+day+"-"+mode+".png";
    const save=async(share=false)=>{
      if(saving || loading || mapLoading || mapFailed)return;
      setSaving(true);setMessage("");
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
      }finally{setSaving(false);}
    };
    return h("dialog",{
        ref:dialogRef,className:"rs-recap-dialog",role:"dialog",
        "aria-modal":true,"aria-label":"라이딩 이미지 저장",
        onCancel:event=>{event.preventDefault();closeRef.current();}
      },
      h("div",{className:"rs-recap-sheet"},
        h("header",{className:"rs-recap-head"},
          h("div",{className:"rs-recap-title"},
            h("small",null,day.replace(/-/g,".")+" · 오늘의 기록"),
            h("h2",null,"라이딩 이미지 저장")),
          button(h,"×",onClose,"rs-recap-close",{"aria-label":"닫기"})),
        h("div",{className:"rs-recap-content"},
          h("div",{className:"rs-recap-preview"},
            h("canvas",{ref:preview,role:"img","aria-label":day+" 라이딩 이미지 미리보기"})),
          h("p",{className:"rs-recap-preview-note"},"실제 지도 · 동 이름 · 수익 · 1080 × 1350"),
          mapLoading?h("p",{className:"rs-recap-state",role:"status"},"주행 지도와 동 이름을 불러오는 중…"):null,
          mapFailed?h("div",{className:"rs-recap-map-error",role:"alert"},
            h("span",null,mapState.error||"지도를 불러오지 못했어요."),
            button(h,"다시 불러오기",()=>setMapRetry(value=>value+1),"rs-recap-map-retry")):null,
          loading?h("p",{className:"rs-recap-state",role:"status"},"결산 기록을 불러오는 중…"):
            loadError?h("p",{className:"rs-recap-state",role:"alert"},"결산 조회 실패 · "+loadError+" (수익 없이 저장 가능)"):null,
          h("label",{className:"rs-recap-toggle rs-recap-income"},
            h("span",null,
              h("strong",null,"수익 공개"),
              h("small",null,"공유용 이미지에 수익 금액 표시")),
            h("input",{type:"checkbox",checked:showIncome,onChange:e=>setShowIncome(e.target.checked),"aria-label":"수익 공개"}),
            h("span",{className:"rs-recap-switch","aria-hidden":true})),
          message&&h("p",{className:"rs-recap-state",role:"status"},message)),
        h("footer",{className:"rs-recap-actions"},
          button(h,"공유",()=>save(true),"rs-recap-share",{disabled:saving||loading||mapLoading||mapFailed}),
          button(h,saving?"이미지 저장 중…":"이미지 저장",()=>save(false),"rs-recap-download",{disabled:saving||loading||mapLoading||mapFailed}))));

  }
  return RideRecap;
}
