import { buildDailyTimeline } from "./daily-timeline.mjs";
import { financeTotals } from "./finance-model.mjs";

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
function drawRoute(ctx,segments,x,y,w,h,p,showRoute) {
  rounded(ctx,x,y,w,h,30,p.tint);
  ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,30);ctx.clip();
  // Discreet editorial grid: these are not claimed to be streets or basemap tiles.
  for(let i=1;i<6;i++) {
    line(ctx,x+24,y+i*h/6,x+w-24,y+i*h/6,p.grid,2);
    line(ctx,x+i*w/6,y+24,x+i*w/6,y+h-24,p.grid,2);
  }
  label(ctx,"RIDE TRACE / GPS",x+36,y+52,21,p.muted,700);
  const points=showRoute?segments.flat():[];
  if(!points.length) {
    label(ctx,showRoute?"기록된 GPS 경로가 없어요":"경로 비공개",x+w/2,y+h/2+8,31,p.muted,600,"center");
    ctx.restore();return;
  }
  const midLat=points.reduce((s,a)=>s+a.lat,0)/points.length;
  const cos=Math.max(.1,Math.cos(midLat*Math.PI/180));
  const transformed=points.map(pt=>({x:pt.lng*cos,y:pt.lat}));
  const minX=Math.min(...transformed.map(pt=>pt.x)),maxX=Math.max(...transformed.map(pt=>pt.x));
  const minY=Math.min(...transformed.map(pt=>pt.y)),maxY=Math.max(...transformed.map(pt=>pt.y));
  const rangeX=Math.max(maxX-minX,0.00015),rangeY=Math.max(maxY-minY,0.00015);
  const scale=Math.min((w-150)/rangeX,(h-150)/rangeY);
  const toXY=pt=>[
    x+w/2+(pt.lng*cos-(minX+maxX)/2)*scale,
    y+h/2-(pt.lat-(minY+maxY)/2)*scale
  ];
  for(const segment of segments) {
    if(!segment.length)continue;
    const stride=Math.max(1,Math.ceil(segment.length/850));
    const sampled=segment.filter((_,index)=>index%stride===0);
    if(sampled[sampled.length-1]!==segment[segment.length-1])sampled.push(segment[segment.length-1]);
    ctx.beginPath();
    sampled.forEach((pt,i)=>{const [px,py]=toXY(pt);if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);});
    ctx.lineWidth=9;ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle=p.accent;ctx.stroke();
  }
  const first=toXY(points[0]),last=toXY(points[points.length-1]);
  for(const [pt,color] of [[first,p.accent],[last,p.ink]]) {
    ctx.beginPath();ctx.arc(pt[0],pt[1],11,0,Math.PI*2);ctx.fillStyle=p.panel;ctx.fill();
    ctx.beginPath();ctx.arc(pt[0],pt[1],7,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
  }
  ctx.restore();
}
function stat(ctx,title,value,x,y,w,p) {
  label(ctx,title,x,y,23,p.muted,600);
  label(ctx,value,x,y+60,36,p.ink,750);
}
function footer(ctx,p,W,H) {
  line(ctx,72,H-112,W-72,H-112,p.grid,2);
  label(ctx,"RIDER SPOT",72,H-61,23,p.ink,750);
  label(ctx,"YOUR DAILY RIDE  /  RIDESPOT",W-72,H-61,20,p.muted,500,"right");
}

// Pure Canvas 2D export, not a screenshot of the live map. No external images,
// remote font requests or cross-origin tiles: PNG export cannot be tainted.
export function renderRecapCanvas(canvas,recap,{mode="all",ratio="4:5",theme="light",showRoute=true,showIncome=true}={}) {
  const H=ratio==="9:16"?1920:ratio==="1:1"?1080:1350,W=1080;
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("이미지 렌더링을 사용할 수 없어요.");
  const p=palettes[theme]||palettes.light;
  rounded(ctx,0,0,W,H,0,p.bg);
  rounded(ctx,72,68,13,13,3,p.accent);
  label(ctx,"RIDER SPOT",98,83,23,p.ink,800);
  label(ctx,recap.day.replace(/-/g,".")+"  ·  DAILY RECORD",W-72,83,21,p.muted,600,"right");
  const title=mode==="finance"?"DAILY SETTLEMENT":mode==="route"?"RIDE IN MOTION":"TODAY IN MOTION";
  label(ctx,title,72,159,54,p.ink,800);
  const income=showIncome?abbreviatedMoney(recap.gross):"비공개";
  if(mode==="finance") {
    label(ctx,"TODAY'S EARNINGS",72,246,27,p.muted,700);
    label(ctx,income,72,346,80,p.ink,800);
    rounded(ctx,72,420,936,H-594,32,p.panel);
    label(ctx,"DAILY BREAKDOWN",116,482,25,p.muted,700);
    const rows=[
      ["총수익",income],
      ["업무 비용",showIncome&&recap.financeLoaded?won(recap.cost):"비공개"],
      ["비용 차감 후",!showIncome?"비공개":recap.uncertain?"확인 필요":abbreviatedMoney(recap.net)],
      ["배달 건수",recap.deliveries===null?"미입력":recap.deliveries+"건"],
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
      label(ctx,"PLATFORMS",116,breakdownBottom+42,22,p.muted,700);
      let cursor=116;
      const sum=recap.platforms.reduce((a,part)=>a+part[1],0);
      for(const [i,[name,value]] of recap.platforms.slice(0,3).entries()) {
        const part=Math.max(3,848*(value/Math.max(1,sum)));
        rounded(ctx,cursor,breakdownBottom+67,Math.min(part,964-cursor),14,7,[p.accent,p.lime,p.muted][i]);
        cursor+=part+5;
      }
    }
  } else {
    const mapTop=207;
    const mapHeight=mode==="route"?Math.min(H*.53,900):Math.min(H*.39,720);
    drawRoute(ctx,recap.segments,72,mapTop,936,mapHeight,p,showRoute);
    const panelTop=mapTop+mapHeight+28;
    const panelHeight=H-panelTop-147;
    rounded(ctx,72,panelTop,936,panelHeight,30,p.panel);
    if(mode==="route") {
      label(ctx,"THE JOURNEY",112,panelTop+57,24,p.muted,700);
      stat(ctx,"운행거리",recap.trips?km(recap.distanceKm):"기록 없음",112,panelTop+120,0,p);
      stat(ctx,"기록시간",duration(recap.durationMs),588,panelTop+120,0,p);
      if(panelHeight>260) {
        line(ctx,112,panelTop+222,968,panelTop+222,p.grid);
        label(ctx,"저장된 운행",112,panelTop+277,23,p.muted,600);
        label(ctx,recap.trips+"회"+(recap.isLive?" · 운행 중":""),968,panelTop+277,28,p.ink,750,"right");
      }
    } else {
      label(ctx,"DAILY EARNINGS",112,panelTop+58,23,p.muted,700);
      label(ctx,income,112,panelTop+146,64,p.ink,800);
      line(ctx,112,panelTop+184,968,panelTop+184,p.grid,2);
      const metricY=panelTop+233;
      stat(ctx,"거리",recap.trips?km(recap.distanceKm):"기록 없음",112,metricY,0,p);
      stat(ctx,"시간",duration(recap.durationMs),438,metricY,0,p);
      stat(ctx,"배달",recap.deliveries===null?"미입력":recap.deliveries+"건",764,metricY,0,p);
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
  footer(ctx,p,W,H);
  return canvas;
}
const dimensions = ratio => ratio==="9:16"?"1080 × 1920":ratio==="1:1"?"1080 × 1080":"1080 × 1350";
const button = (h,label,onClick,cls,props={})=>h("button",{type:"button",className:cls,onClick,...props},label);

export function createRideRecap(React,client) {
  const h=React.createElement;
  function RideRecap({day,history=[],user,financeData=null,onClose,notify}) {
    const [mode,setMode]=React.useState("all");
    const [ratio,setRatio]=React.useState("4:5");
    const [theme,setTheme]=React.useState("light");
    const [showRoute,setShowRoute]=React.useState(true);
    const [showIncome,setShowIncome]=React.useState(true);
    const [remote,setRemote]=React.useState(null);
    const [loadError,setLoadError]=React.useState("");
    const [saving,setSaving]=React.useState(false);
    const [message,setMessage]=React.useState("");
    const preview=React.useRef(null);
    const closeRef=React.useRef(onClose);closeRef.current=onClose;
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
    React.useEffect(()=>{
      if(!preview.current)return;
      try{renderRecapCanvas(preview.current,recap,{mode,ratio,theme,showRoute,showIncome});setMessage("");}
      catch(error){setMessage("이미지 미리보기를 만들지 못했어요.");}
    },[recap,mode,ratio,theme,showRoute,showIncome]);
    const toPng=()=>new Promise((resolve,reject)=>{
      const canvas=document.createElement("canvas");
      renderRecapCanvas(canvas,recap,{mode,ratio,theme,showRoute,showIncome});
      canvas.toBlob(blob=>blob?resolve(blob):reject(Error("PNG 이미지 생성에 실패했어요.")),"image/png");
    });
    const fileName="riderspot-"+day+"-"+mode+".png";
    const save=async(share=false)=>{
      if(saving || loading)return;
      setSaving(true);setMessage("");
      try{
        const blob=await toPng();
        if(share) {
          const file=new File([blob],fileName,{type:"image/png"});
          if(!navigator.share || !navigator.canShare?.({files:[file]})) {
            setMessage("이 환경에서는 직접 공유가 지원되지 않아요. 이미지 저장을 이용해 주세요.");
            return;
          }
          await navigator.share({files:[file],title:"RIDER SPOT · "+day});
          return;
        }
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");
        a.href=url;a.download=fileName;a.style.display="none";
        document.body.appendChild(a);a.click();a.remove();
        window.setTimeout(()=>URL.revokeObjectURL(url),60000);
        setMessage("저장을 요청했어요. 다운로드 또는 갤러리에서 확인해 주세요.");
      }catch(error){
        if(error?.name!=="AbortError")setMessage(error?.message||"이미지를 저장할 수 없어요.");
      }finally{setSaving(false);}
    };
    const group=(title,current,options,change)=>h("div",{className:"rs-recap-control"},
      h("span",{className:"rs-recap-label"},title),
      h("div",{className:"rs-recap-segments"},options.map(([value,label])=>button(h,label,()=>change(value),
        "rs-recap-choice"+(current===value?" selected":""),{key:value,"aria-pressed":current===value}))));
    const toggle=(title,subtitle,value,onChange)=>h("label",{className:"rs-recap-toggle"},
      h("span",null,h("strong",null,title),h("small",null,subtitle)),
      h("input",{type:"checkbox",checked:value,onChange:e=>onChange(e.target.checked),"aria-label":title}),
      h("span",{className:"rs-recap-switch","aria-hidden":true}));
    return h("div",{className:"rs-recap-shade",role:"presentation"},
      h("section",{className:"rs-recap-sheet",role:"dialog","aria-modal":true,"aria-label":"라이딩 이미지 만들기"},
        h("header",{className:"rs-recap-head"},
          h("div",null,h("small",null,"RIDER SPOT / EXPORT"),h("h2",null,"라이딩 이미지 만들기")),
          button(h,"×",onClose,"rs-recap-close",{"aria-label":"닫기"})),
        h("div",{className:"rs-recap-preview"},
          h("canvas",{ref:preview,role:"img","aria-label":day+" 라이딩 이미지 미리보기"})),
        h("p",{className:"rs-recap-preview-note"},day.replace(/-/g,".")+"  ·  "+dimensions(ratio)+" PNG  ·  GPS 원본 좌표는 이미지에 문자로 표시하지 않아요."),
        loading?h("p",{className:"rs-recap-state",role:"status"},"결산 기록을 불러오는 중…"):
          loadError?h("p",{className:"rs-recap-state",role:"alert"},"결산 조회 실패 · "+loadError+" (수익 없이 저장 가능)"):null,
        group("이미지 구성",mode,[["all","올인원"],["route","타임라인"],["finance","결산 카드"]],setMode),
        group("이미지 비율",ratio,[["4:5","피드 4:5"],["9:16","스토리 9:16"],["1:1","정사각형"]],setRatio),
        group("컬러 테마",theme,[["light","오프화이트"],["mist","미스트"],["night","슬레이트"]],setTheme),
        toggle("경로 표시","실제 GPS 궤적만 표시합니다",showRoute,setShowRoute),
        toggle("수익 공개","공유 전 금액 노출 여부를 확인하세요",showIncome,setShowIncome),
        message&&h("p",{className:"rs-recap-state",role:"status"},message),
        h("footer",{className:"rs-recap-actions"},
          button(h,"공유하기",()=>save(true),"rs-recap-share",{disabled:saving||loading}),
          button(h,saving?"이미지 준비 중…":"PNG 저장",()=>save(false),"rs-recap-download",{disabled:saving||loading})))));
  }
  return RideRecap;
}
