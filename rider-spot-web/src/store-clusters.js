(()=>{
"use strict";
const VERSION="rs-shops-v23",ROOT="/mapdata/",MAX_TILES=10,MAX_VISIBLE=54,MIN_ZOOM=15.25;
const cache=new Map();
let manifestPromise=null;
const collator=new Intl.Collator("ko",{numeric:true,sensitivity:"base"});
function manifest(){
  if(!manifestPromise)manifestPromise=fetch(ROOT+"manifest.json",{credentials:"same-origin"})
    .then(r=>{if(!r.ok)throw Error("상호 데이터 목록 요청 실패");return r.json()})
    .catch(e=>{manifestPromise=null;throw e});
  return manifestPromise;
}
function tile(name){
  if(!/^t\d+-\d+$/.test(name))return Promise.resolve([]);
  if(cache.has(name)){
    const promise=cache.get(name);cache.delete(name);cache.set(name,promise);
    return promise;
  }
  const promise=fetch(ROOT+name+".json",{credentials:"same-origin"})
    .then(r=>{if(!r.ok)throw Error("상호 위치 데이터 요청 실패");return r.json()})
    .then(v=>Array.isArray(v)?v:[])
    .catch(e=>{cache.delete(name);throw e});
  cache.set(name,promise);
  while(cache.size>MAX_TILES)cache.delete(cache.keys().next().value);
  return promise;
}
function tileKeys(info,b){
  if(!Array.isArray(info?.tiles)||!Array.isArray(info.bbox)||b.east<info.bbox[0]||b.west>info.bbox[2]||b.north<info.bbox[1]||b.south>info.bbox[3])return [];
  const w=Math.max(info.bbox[0],b.west),e=Math.min(info.bbox[2],b.east),
    s=Math.max(info.bbox[1],b.south),n=Math.min(info.bbox[3],b.north),size=Number(info.size)||.04;
  const registered=new Set(info.tiles),out=[];
  for(let x=Math.floor(w/size);x<=Math.floor(e/size);x++){
    for(let y=Math.floor(s/size);y<=Math.floor(n/size);y++){
      const key="t"+x+"-"+y;
      if(registered.has(key))out.push(key);
    }
  }
  return out;
}
function nameRows(groups,b,tiles){
  for(const rows of tiles){
    for(const item of rows){
      if(!Array.isArray(item)||item.length<4||item[3]!=="shop")continue;
      const lon=Number(item[0]),lat=Number(item[1]),name=typeof item[2]==="string"?item[2].trim():"";
      if(!name||name.length>90||!Number.isFinite(lon)||!Number.isFinite(lat)
        ||lon<b.west||lon>b.east||lat<b.south||lat>b.north)continue;
      // These are source coordinates, not confirmed premises/building IDs.
      const key=lon.toFixed(5)+","+lat.toFixed(5);
      let g=groups.get(key);
      if(!g){g={key,lon,lat,names:new Map(),total:0};groups.set(key,g)}
      g.total++;
      g.names.set(name,(g.names.get(name)||0)+1);
    }
  }
}
function representative(g){
  const entries=[...g.names.keys()];
  const food=/(?:치킨|피자|떡볶이|분식|김밥|국밥|식당|커피|카페|버거|햄버거|족발|보쌈|돈까스|초밥|육회|중국집|설렁탕|샐러드|덮밥|냉면|편의점|파스타|스타벅스|컴포즈|메가커피|배스킨)/i;
  entries.sort((a,b)=>{
    const score=s=>(food.test(s)?20:0)+(s.length<=13?6:0)-(s.includes("업소명없음")?100:0);
    return score(b)-score(a)||collator.compare(a,b);
  });
  return entries[0]||"등록 매장";
}
function makeChip(g,map,showName){
  const wrap=document.createElement("div");wrap.className="rs-store-pin";
  const btn=document.createElement("button");
  btn.type="button";btn.className="rs-store-chip";
  const count=g.names.size,rep=representative(g);
  const pin=document.createElement("span");pin.className="rs-store-chip-mark";pin.textContent="⌂";pin.setAttribute("aria-hidden","true");
  btn.append(pin);
  const label=document.createElement("span");label.className="rs-store-chip-title";
  label.textContent=showName?rep:"매장";
  btn.append(label);
  if(count>1){
    const badge=document.createElement("span");badge.className="rs-store-chip-count";badge.textContent=count+"곳";
    btn.append(badge);
  }
  btn.title=count>1?rep+" 외 등록 매장 "+(count-1)+"곳":rep;
  btn.setAttribute("aria-label","이 위치 등록 매장 "+count+"곳 목록 보기");
  btn.addEventListener("pointerdown",e=>e.stopPropagation());
  btn.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openSheet(g,btn)});
  wrap.append(btn);
  const mark=new window.maplibregl.Marker({element:wrap,anchor:"bottom",offset:[0,-1]})
    .setLngLat([g.lon,g.lat]).addTo(map);
  return mark;
}
function openSheet(g,trigger){
  document.querySelector(".rs-store-overlay")?.remove();
  const back=document.createElement("div");back.className="rs-store-overlay";
  const panel=document.createElement("section");panel.className="rs-store-sheet";
  panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");
  panel.setAttribute("aria-label","이 위치에 등록된 매장 목록");
  const handle=document.createElement("div");handle.className="rs-store-grab";
  handle.setAttribute("aria-hidden","true");handle.append(document.createElement("span"));
  const top=document.createElement("div");top.className="rs-store-head";
  const heading=document.createElement("div");heading.className="rs-store-heading";
  const eyebrow=document.createElement("span");eyebrow.className="rs-store-kicker";eyebrow.textContent="RIDERS POT · STORE INDEX";
  const h=document.createElement("h2");h.textContent="이 위치 등록 매장";
  const summary=document.createElement("p");summary.textContent="등록된 상호를 모두 확인할 수 있어요.";
  heading.append(eyebrow,h,summary);
  const closeBtn=document.createElement("button");closeBtn.type="button";closeBtn.className="rs-store-close";
  closeBtn.setAttribute("aria-label","매장 목록 닫기");closeBtn.textContent="×";
  top.append(heading,closeBtn);
  const bar=document.createElement("div");bar.className="rs-store-summary";
  const left=document.createElement("div");left.className="rs-store-number";
  const count=document.createElement("strong");count.textContent=g.names.size.toLocaleString("ko-KR");
  const words=document.createElement("span");words.textContent="개의 상호명";left.append(count,words);
  const note=document.createElement("span");note.className="rs-store-coordinate";
  note.textContent="같은 등록 좌표 기준";
  bar.append(left,note);
  const searchRow=document.createElement("div");searchRow.className="rs-store-search";
  const glass=document.createElement("span");glass.textContent="⌕";glass.setAttribute("aria-hidden","true");
  const search=document.createElement("input");search.type="search";search.placeholder="매장명 검색";
  search.setAttribute("aria-label","목록 내 매장명 검색");search.autocomplete="off";
  searchRow.append(glass,search);
  const results=document.createElement("div");results.className="rs-store-list";
  results.setAttribute("role","list");
  const footer=document.createElement("div");footer.className="rs-store-foot";
  const disclaimer=document.createElement("p");
  disclaimer.textContent="공공 상가정보 기반 · 같은 좌표가 같은 건물을 뜻하지는 않으며 영업 여부는 다를 수 있어요.";
  footer.append(disclaimer);
  const entries=[...g.names.entries()].sort((a,b)=>collator.compare(a[0],b[0]));
  const qty=document.createElement("span");qty.className="rs-store-results";
  const listHeading=document.createElement("div");listHeading.className="rs-store-listheading";
  const listLabel=document.createElement("strong");listLabel.textContent="전체 매장명";
  listHeading.append(listLabel,qty);
  function renderList(){
    const term=search.value.trim().toLocaleLowerCase("ko-KR");
    const selected=term?entries.filter(([name])=>name.toLocaleLowerCase("ko-KR").includes(term)):entries;
    qty.textContent=selected.length.toLocaleString("ko-KR")+"개 표시";
    const fragment=document.createDocumentFragment();
    selected.forEach(([name,frequency],index)=>{
      const row=document.createElement("div");row.className="rs-store-item";row.setAttribute("role","listitem");
      const number=document.createElement("span");number.className="rs-store-index";number.textContent=String(index+1).padStart(2,"0");
      const text=document.createElement("span");text.className="rs-store-name";text.textContent=name;
      row.append(number,text);
      if(frequency>1){
        const multi=document.createElement("small");multi.className="rs-store-dupes";multi.textContent="등록 "+frequency+"건";
        row.append(multi);
      }
      fragment.append(row);
    });
    if(!selected.length){
      const empty=document.createElement("p");empty.className="rs-store-empty";
      empty.textContent="검색 결과가 없어요.";fragment.append(empty);
    }
    results.replaceChildren(fragment);
  }
  search.addEventListener("input",renderList);renderList();
  const originalOverflow=document.body.style.overflow;
  let disposed=false,unregister=null;
  const dispose=()=>{
    if(disposed)return;disposed=true;
    document.removeEventListener("keydown",esc);
    window.removeEventListener("riderspot:screen",dispose);
    unregister?.();back.remove();
    document.body.style.overflow=originalOverflow;
    if(trigger?.isConnected)trigger.focus({preventScroll:true});
  };
  const esc=e=>{if(e.key==="Escape"){e.preventDefault();dispose()}};
  document.addEventListener("keydown",esc);
  window.addEventListener("riderspot:screen",dispose);
  closeBtn.addEventListener("click",dispose);
  back.addEventListener("click",e=>{if(e.target===back)dispose()});
  let startY=0;
  handle.addEventListener("touchstart",e=>{startY=e.touches[0]?.clientY||0},{passive:true});
  handle.addEventListener("touchend",e=>{if((e.changedTouches[0]?.clientY||0)-startY>70)dispose()},{passive:true});
  panel.append(handle,top,bar,searchRow,listHeading,results,footer);
  back.append(panel);document.body.append(back);
  document.body.style.overflow="hidden";
  unregister=window.__rsNavigation?.registerLayer?.("shop-list",dispose)||null;
  closeBtn.focus({preventScroll:true});
  return dispose;
}
function mount(map){
  if(!map||!window.maplibregl?.Marker)return ()=>{};
  let alive=true,revision=0,timer=0,pins=[],lastError="";
  const stopPins=()=>{for(const item of pins)item.remove();pins=[];map.__rsPinOverlay?.clearGroup("shops")};
  async function update(){
    if(!alive)return;
    const current=++revision,zoom=map.getZoom();
    if(zoom<MIN_ZOOM||!map.getContainer()?.isConnected){stopPins();return}
    const b=map.getBounds();if(!b)return;
    const bbox={west:b.getWest(),east:b.getEast(),south:b.getSouth(),north:b.getNorth()};
    try{
      const info=await manifest();
      if(!alive||current!==revision)return;
      const keys=tileKeys(info,bbox);
      if(!keys.length){stopPins();return}
      const rows=await Promise.all(keys.map(tile));
      if(!alive||current!==revision)return;
      const grouped=new Map();nameRows(grouped,bbox,rows);
      const zoomMin=zoom<16?3:zoom<17.4?2:1;
      const width=map.getContainer().clientWidth,height=map.getContainer().clientHeight;
      const eligible=[];
      for(const group of grouped.values()){
        if(group.names.size<zoomMin)continue;
        const pt=map.project([group.lon,group.lat]);
        if(!pt||!Number.isFinite(pt.x)||!Number.isFinite(pt.y)||pt.x<95||pt.x>width-96||pt.y<166||pt.y>height-124)continue;
        eligible.push({...group,px:pt.x,py:pt.y});
      }
      // Favor buildings with many names, while spreading chips across the screen.
      const cx=width/2,cy=height/2;
      eligible.sort((a,b)=>Math.min(b.names.size,60)-Math.min(a.names.size,60)
        || Math.hypot(a.px-cx,a.py-cy)-Math.hypot(b.px-cx,b.py-cy));
      const selected=[],max=width<460?26:MAX_VISIBLE;
      for(const group of eligible){
        const space=zoom>=16.7?164:94;
        if(selected.some(prev=>Math.abs(group.px-prev.px)<space&&Math.abs(group.py-prev.py)<48))continue;
        selected.push(group);
        if(selected.length>=max)break;
      }
      const gpu=map.__rsPinOverlay;
      const replacement=gpu?selected.map(g=>({id:g.key,lng:g.lon,lat:g.lat,kind:"shop",
        name:zoom>=16.7?representative(g):"매장",count:g.names.size,
        onClick:()=>openSheet(g,null)})):selected.map(g=>makeChip(g,map,zoom>=16.7));
      if(!alive||current!==revision){if(!gpu)replacement.forEach(marker=>marker.remove());return}
      stopPins();
      if(gpu){gpu.setGroup("shops",replacement)}else{pins=replacement}
      lastError="";
      window.__rsStoreOverlayStats={version:VERSION,groups:grouped.size,candidates:eligible.length,markers:replacement.length,zoom,engine:gpu?"maplibre-layer":"dom"};
    }catch(error){
      if(!alive||current!==revision)return;
      if(String(error)!==lastError){lastError=String(error);console.warn("RiderSpot public shop locations:",error?.message||error)}
    }
  }
  function schedule(){
    revision++;
    clearTimeout(timer);
    timer=setTimeout(()=>{void update()},130);
  }
  map.on("moveend",schedule);
  map.on("load",schedule);
  if(map.loaded?.()||map.isStyleLoaded?.())schedule();
  window.__rsStoreClustersReady=true;
  return()=>{
    alive=false;revision++;
    clearTimeout(timer);stopPins();
    map.off("moveend",schedule);map.off("load",schedule);
    document.querySelector(".rs-store-overlay .rs-store-close")?.click();
    if(window.__rsStoreClustersReady)window.__rsStoreClustersReady=false;
  };
}
window.__rsMountStoreClusters=mount;
})();