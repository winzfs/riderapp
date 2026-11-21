// Read-only, independent MapLibre snapshot for ride recap exports.
// The live Leaflet/MapLibre GPS camera is never accessed or moved.
export const RECAP_BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

// Only the temporary offscreen MapLibre instance is restyled, never the live map.
// Missing layers are ignored because third-party style manifests can evolve.
export function applyRecapEditorialStyle(map) {
  const layers=map.getStyle()?.layers||[];
  let changed=0;
  for(const layer of layers){
    const name=String(layer.id||"").toLowerCase();
    const paint=(property,value)=>{try{map.setPaintProperty(layer.id,property,value);changed++;}catch{}};
    if(layer.type==="background")paint("background-color","#F1F3EF");
    if(layer.type==="fill"){
      if(/water|river|lake/.test(name))paint("fill-color","#DBE6E9");
      else if(/park|green|wood|grass|landcover|landuse/.test(name))paint("fill-color","#E8EDE6");
      else if(/building/.test(name))paint("fill-color","#E9EDEA");
    }
    if(layer.type==="line"){
      if(/road|street|highway|transportation/.test(name))paint("line-color",/casing|outline/.test(name)?"#D6DCD8":"#FFFFFF");
      else if(/water|river/.test(name))paint("line-color","#C8DCE1");
    }
    if(layer.type==="symbol"){
      // The upstream basemap mixes romanized streets, waterways and places.
      // Official Korean administrative labels are drawn separately by Canvas.
      try{map.setLayoutProperty(layer.id,"visibility","none");changed++;}catch{}
    }
  }
  return changed;
}
const GL_SCRIPT = "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js";
let libPromise=null;
let dongPromise=null;

const validPoint = p => Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lng))
  && Math.abs(Number(p.lat)) <= 90 && Math.abs(Number(p.lng)) <= 180
  && !(Number(p.lat) === 0 && Number(p.lng) === 0);

export function recapMapBounds(segments) {
  let south=Infinity,north=-Infinity,west=Infinity,east=-Infinity,has=false;
  for(const segment of segments||[])for(const p of segment||[])if(validPoint(p)){
    const lat=Number(p.lat),lng=Number(p.lng);
    south=Math.min(south,lat);north=Math.max(north,lat);
    west=Math.min(west,lng);east=Math.max(east,lng);has=true;
  }
  if(!has)return null;
  // Preserve routes even for one stationary GPS fix (bounds cannot be zero-sized).
  const paddingLat=Math.max(0.00035,(north-south)*.035);
  const paddingLng=Math.max(0.00035,(east-west)*.035);
  return [[west-paddingLng,south-paddingLat],[east+paddingLng,north+paddingLat]];
}

function abortError(){const e=new Error("지도 이미지 작업이 취소되었어요.");e.name="AbortError";return e;}
function throwIfAborted(signal){if(signal?.aborted)throw abortError();}

async function mapLibre() {
  if(typeof window==="undefined")throw Error("브라우저 지도를 사용할 수 없어요.");
  if(window.maplibregl?.Map)return window.maplibregl;
  if(!libPromise){
    libPromise=new Promise((resolve,reject)=>{
      const existing=[...document.querySelectorAll("script[src]")].find(node=>node.src===GL_SCRIPT);
      const script=existing||document.createElement("script");
      const done=()=>window.maplibregl?.Map?resolve(window.maplibregl):reject(Error("지도 렌더러를 불러오지 못했어요."));
      const fail=()=>reject(Error("지도 라이브러리를 불러오지 못했어요."));
      script.addEventListener("load",done,{once:true});
      script.addEventListener("error",fail,{once:true});
      if(!existing){script.src=GL_SCRIPT;script.async=true;script.crossOrigin="anonymous";document.head.appendChild(script);}
      // Existing script can finish before the event handlers were added.
      if(window.maplibregl?.Map)done();
    }).catch(error=>{libPromise=null;throw error;});
  }
  return libPromise;
}

async function officialDongs() {
  if(!dongPromise)dongPromise=fetch("/mapdata/admin.json",{credentials:"same-origin"})
    .then(response=>response.ok?response.json():[])
    .then(rows=>Array.isArray(rows)?rows:[])
    .catch(()=>{dongPromise=null;return [];});
  return dongPromise;
}

// Positions are read from actual Korean public administrative data; never
// invent local place names or derive arbitrary labels from a GPS coordinate.
export function recapDongLabels(rows,bounds,project,width,height) {
  if(!Array.isArray(rows)||!bounds)return [];
  const [[west,south],[east,north]]=bounds;
  const candidates=[];
  const cx=width/2,cy=height/2;
  for(const row of rows){
    if(!Array.isArray(row)||row.length<4)continue;
    const [lng,lat,name,kind]=row;
    if(kind!=="region"||typeof name!=="string"||!(/(?:동|읍|면)$/.test(name)))continue;
    if(!Number.isFinite(lng)||!Number.isFinite(lat)||
      lng<west||lng>east||lat<south||lat>north)continue;
    const p=project(lng,lat);
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
    if(p.x<45||p.x>width-45||p.y<70||p.y>height-40)continue;
    candidates.push({name,x:p.x,y:p.y,score:Math.hypot(p.x-cx,p.y-cy)});
  }
  candidates.sort((a,b)=>a.score-b.score);
  const chosen=[];
  for(const candidate of candidates){
    if(chosen.some(p=>Math.abs(p.x-candidate.x)<108 && Math.abs(p.y-candidate.y)<48))continue;
    chosen.push({name:candidate.name,x:Math.round(candidate.x),y:Math.round(candidate.y)});
    if(chosen.length>=12)break;
  }
  return chosen;
}

export async function loadRideRecapBasemap(segments,{width=936,height=430,signal}={}) {
  const bounds=recapMapBounds(segments);
  if(!bounds)return null;
  throwIfAborted(signal);
  const [lib,names]=await Promise.all([mapLibre(),officialDongs()]);
  throwIfAborted(signal);
  const container=document.createElement("div");
  Object.assign(container.style,{
    position:"fixed",left:"-12000px",top:"0px",width:width+"px",height:height+"px",
    pointerEvents:"none",opacity:"0",zIndex:"-1",overflow:"hidden"
  });
  container.setAttribute("aria-hidden","true");
  document.body.appendChild(container);
  let map=null;
  let onAbort=null;
  try{
    // preserveDrawingBuffer is scoped to this temporary export-only canvas.
    // The live map and its WebGL lifecycle are not affected.
    map=new lib.Map({
      container,style:RECAP_BASEMAP_STYLE,
      center:[(bounds[0][0]+bounds[1][0])/2,(bounds[0][1]+bounds[1][1])/2],
      zoom:12,interactive:false,attributionControl:false,
      preserveDrawingBuffer:true,fadeDuration:0
    });
    await new Promise((resolve,reject)=>{
      let settled=false;
      const done=(error)=>{
        if(settled)return;
        settled=true;clearTimeout(timer);signal?.removeEventListener("abort",onAbort);
        if(error)reject(error);else resolve();
      };
      onAbort=()=>done(abortError());
      signal?.addEventListener("abort",onAbort,{once:true});
      const timer=setTimeout(()=>done(Error("지도 불러오기 시간이 초과되었어요.")),14000);
      map.once("load",()=>{
        if(settled)return;
        try {
          // Tone down the export-only tiles before snapshot; preserve main map style.
          applyRecapEditorialStyle(map);
          map.fitBounds(bounds,{padding:{top:66,bottom:54,left:74,right:74},
            maxZoom:15.5,duration:0});
          map.once("idle",()=>done());
          // A raster snapshot is captured only when the style and tiles settle.
          if(map.loaded())requestAnimationFrame(()=>map.loaded()&&done());
        }catch(error){done(error);}
      });
      map.on("error",evt=>{
        // One tile error should not blank an otherwise usable map.
        console.warn("라이딩 이미지 지도:",evt?.error?.message||"일부 지도 타일 로드 실패");
      });
    });
    throwIfAborted(signal);
    const positions=segments.map(segment=>segment.filter(validPoint).map(p=>{
      const xy=map.project([Number(p.lng),Number(p.lat)]);
      return {x:xy.x,y:xy.y};
    })).filter(segment=>segment.length);
    const labels=recapDongLabels(names,bounds,(lng,lat)=>map.project([lng,lat]),width,height);
    const png=map.getCanvas().toDataURL("image/png");
    if(png.length<3000)throw Error("지도 이미지를 생성하지 못했어요.");
    const image=new Image();
    image.src=png;
    if(typeof image.decode==="function")await image.decode();
    else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error("지도 이미지 처리 실패"));});
    throwIfAborted(signal);
    return {image,positions,labels,hasBasemap:true};
  } finally {
    if(onAbort)signal?.removeEventListener("abort",onAbort);
    try{map?.remove();}catch{}
    container.remove();
  }
}
