/* Rider Spot endpoint labels v32: native Korean start/end, GPS anchored and overlap safe. */
/* RiderSpot native course renderer v31: install on style.load even before tiles finish; retry on map load. */
(()=>{
"use strict";
const ML=()=>window.maplibregl;
const valid=p=>p&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lng)&&Math.abs(+p.lat)<=90&&Math.abs(+p.lng)<=180;
const ll=p=>Array.isArray(p)?[+p[1],+p[0]]:[+p.lng,+p.lat];
const llObject=p=>Array.isArray(p)?{lat:+p[0],lng:+p[1]}:{lat:+p.lat,lng:+p.lng};
const EMPTY={type:"FeatureCollection",features:[]};
function featureLine(coords,properties){
 const pairs=(coords||[]).filter(p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])).map(p=>[+p[1],+p[0]]);
 if(pairs.length<2)return null;
 return {type:"Feature",properties:properties||{},geometry:{type:"LineString",coordinates:pairs}};
}
function circleCoordinates(lat,lng,radius,count=28){
 const coords=[],c=Math.max(.15,Math.cos(lat*Math.PI/180));
 for(let i=0;i<=count;i++){const a=i/count*Math.PI*2;coords.push([lng+radius*Math.cos(a)/(111195*c),lat+radius*Math.sin(a)/111195]);}
 return coords;
}
function createMarkerAdapter(){
 function group(){
   let map=null;
   const children=new Set();
   return {
     _nativeGroup:true,
     addTo(target){map=target;for(const child of children)child._mount(target);return this},
     addLayer(child){children.add(child);child._parent=this;if(map)child._mount(map);return this},
     removeLayer(child){if(children.has(child)){children.delete(child);child.remove()}return this},
     clearLayers(){for(const child of [...children])child.remove();children.clear();return this},
     remove(){this.clearLayers();map=null;return this}
   };
 }
 function marker(latlng,options={}){
   const icon=options.icon||{};
   const el=document.createElement("div");
   el.className=icon.className||"rs-native-marker";
   if(icon.html)el.innerHTML=icon.html;
   else el.innerHTML="<span class='rs-native-default-pin'></span>";
   el.style.pointerEvents="auto";
   el.style.cursor=options.draggable?"grab":"pointer";
   const size=icon.iconSize||[32,32],anchor=icon.iconAnchor||[size[0]/2,size[1]];
   el.style.width=size[0]+"px";
   el.style.height=size[1]+"px";
   if(options.title)el.title=options.title;
   const native=new (ML().Marker)({
      element:el,anchor:"center",
      offset:[size[0]/2-anchor[0],size[1]/2-anchor[1]],
      draggable:Boolean(options.draggable)
   }).setLngLat(ll(latlng));
   let map=null,parent=null,popup=null,removed=false,usingGpu=false;
   const gpuId="rs-report-"+(window.__rsGpuPinUid=(window.__rsGpuPinUid||0)+1);
   const listeners=new Map();
   function notify(event,payload){for(const fn of listeners.get(event)||[])try{fn(payload||{})}catch(e){console.warn("map marker callback",e)}}
   function gpuSpec(){const cls=String(icon.className||"");const kind=/restroom|toilet|public-marker--toilet/i.test(cls)?"toilet":/roads|road|traffic|danger/i.test(cls)?"road":"report";return{kind,onClick:()=>{notify("click",{});if(popup)api.openPopup()}}}
   el.addEventListener("click",e=>{e.stopPropagation();notify("click",{originalEvent:e});if(popup)api.openPopup()});
   const api={
      _nativeMarker:true,
      _parent:null,
      getElement(){return el},
      getLatLng(){const v=native.getLngLat();return{lat:v.lat,lng:v.lng}},
      getPopup(){return popup},
      setLatLng(v){native.setLngLat(ll(v));if(usingGpu&&map?.__rsPinOverlay){const p=native.getLngLat();map.__rsPinOverlay.set(gpuId,[p.lng,p.lat],gpuSpec())}return this},
      setIcon(v){el.className=v.className||el.className;el.innerHTML=v.html||"";icon.className=v.className||icon.className;if(usingGpu&&map?.__rsPinOverlay){const p=native.getLngLat();map.__rsPinOverlay.set(gpuId,[p.lng,p.lat],gpuSpec())}return this},
      bindTooltip(v){el.title=typeof v==="string"?v:v?.textContent||"";return this},
      bindPopup(v){popup=v;return this},
      openPopup(){if(popup)notify("popupopen",{});return this},
      closePopup(){notify("popupclose",{});return this},
      on(type,fn){
        if(!listeners.has(type))listeners.set(type,new Set());
        listeners.get(type).add(fn);
        if(type==="dragend"||type==="drag"||type==="dragstart")native.on(type,fn);
        return this;
      },
      off(type,fn){listeners.get(type)?.delete(fn);return this},
      _mount(target){
        if(removed)removed=false;
        if(map!==target){
          if(!options.draggable&&target.__rsPinOverlay){
            usingGpu=true;map=target;const p=native.getLngLat();
            target.__rsPinOverlay.set(gpuId,[p.lng,p.lat],gpuSpec());
          }else{usingGpu=false;native.addTo(target);map=target}
        }
        return this;
      },
      addTo(target){
        if(target?._nativeGroup){target.addLayer(this);return this}
        return this._mount(target);
      },
      remove(){
        if(map||!removed){notify("remove",{});if(usingGpu){map?.__rsPinOverlay?.remove(gpuId)}else native.remove();}
        removed=true;usingGpu=false;map=null;
        this._parent?._removeOnly?.(this);
        return this;
      }
   };
   native.on("dragend",()=>{}); // Native dragging supplies the original GPS-free coordinate.
   return api;
 }
 function adapter(){
   return {
     divIcon(opts){return opts||{}},
     marker,
     layerGroup:group,
     point(x,y){return Array.isArray(x)?{x:x[0],y:x[1]}:{x,y}},
     latLngBounds(points){return points}
   };
 }
 return adapter();
}
const overlayL=createMarkerAdapter();
function compatMap(map){
 const oldRemove=map.removeLayer.bind(map);
 map.removeLayer=function(v){if(typeof v==="string")return oldRemove(v);v?.remove?.();return this};
 map.setView=function(coordinates,zoom){
    map.jumpTo({center:ll(coordinates),zoom:Number.isFinite(+zoom)?+zoom:map.getZoom()});return map;
 };
 map.invalidateSize=function(){map.resize();return map};
 map.getSize=function(){const e=map.getContainer();return{x:e.clientWidth,y:e.clientHeight}};
 map.latLngToContainerPoint=function(p){return map.project(ll(p))};
 map.containerPointToLatLng=function(p){const r=map.unproject(Array.isArray(p)?p:[p.x,p.y]);return{lat:r.lat,lng:r.lng}};
 map.closePopup=function(){return map};
 map.on("click",e=>{e.latlng=e.lngLat});
 return map;
}
function polishLabels(map){
 const style=map.getStyle();
 if(!style?.layers)return;
 for(const layer of style.layers){
    if(layer.id.startsWith("rs-native-"))continue;
    if(layer["source-layer"]==="poi"||/^(?:poi[_-]|rs-poi-|poi$)/.test(layer.id)){
       try{map.setLayoutProperty(layer.id,"visibility","none")}catch{}
    }
 }
 if(!style.sources?.openmaptiles)return;
 const names=["coalesce",["get","name:ko"],["get","name:nonlatin"],["get","name"],["get","name:latin"]];
 const tiers=[
   ["district","place",["suburb","borough","town"],8.5,"#405d57",[11,11.5,13,13,16,14]],
   ["neighbourhood","place",["quarter","neighbourhood","village","hamlet"],9.1,"#556e67",[11,10.3,13,11.7,16,13]],
   ["major-road","transportation_name",["trunk","primary","secondary","tertiary"],12.6,"#77837e",[12,9.3,14,10.7,16,12]]
 ];
 for(const [id,source,classes,minzoom,color,size] of tiers){
   const layerId="rs-native-"+id;
   if(map.getLayer(layerId))continue;
   const isRoad=id==="major-road";
   const layout={"text-field":names,"text-font":["Noto Sans Regular"],
     "text-size":["interpolate",["linear"],["zoom"],...size],
     "text-max-width":10,"text-padding":isRoad?6:2,"text-optional":true,
     "text-allow-overlap":false,
     "text-variable-anchor":["top","bottom","left","right"]};
   if(isRoad){layout["symbol-placement"]="line";layout["symbol-spacing"]=400;layout["text-max-angle"]=40}
   try{map.addLayer({id:layerId,type:"symbol",source:"openmaptiles","source-layer":source,
     minzoom,filter:["match",["get","class"],classes,true,false],layout,
     paint:{"text-color":color,"text-halo-color":"#f8fbfa","text-halo-width":1.65}});
   }catch(err){console.warn("native Korean map labels",err?.message||err)}
 }
}
function readCamera(key,oldKey){
 for(const store of [window.sessionStorage,window.localStorage]){
   for(const k of [key,oldKey]){
    if(!k)continue;
    try{const v=JSON.parse(store.getItem(k)||"null");
      if(valid(v)&&Number.isFinite(v.zoom)&&v.zoom>=7.5&&v.zoom<=19)return v;
    }catch{}
   }
 }
 return null;
}
function saveCamera(key,value){
 for(const store of [window.sessionStorage,window.localStorage]){
   try{store.setItem(key,JSON.stringify(value))}catch{}
 }
}
function firstSymbol(map){return map.getStyle?.()?.layers?.find(l=>l.type==="symbol")?.id}
function makeRoute(geometry){
 const features=[];
 if(!geometry)return EMPTY;
 for(let tier=3;tier>=1;tier--){
   const runs=(geometry.railRuns||[]).slice(tier+1).flat();
   for(const run of runs){const f=featureLine(run,{kind:"rail",width:7+4*tier});if(f)features.push(f)}
 }
 for(const path of geometry.paths||[]){const f=featureLine(path,{kind:"casing"});if(f)features.push(f)}
 const stops=[[246,151,69],[238,184,108],[205,200,143],[123,160,139],[22,112,91]];
 function toneColor(idx,total){
   const p=total<=1?0:idx/(total-1),s=Math.min(stops.length-2,Math.floor(p*(stops.length-1))),
     u=p*(stops.length-1)-s;
   return "rgb("+stops[s].map((v,i)=>Math.round(v+(stops[s+1][i]-v)*u)).join(",")+")";
 }
 const bands=geometry.gradient||[];
 for(let i=0;i<bands.length;i++){
   for(const segment of bands[i]||[]){
     const f=featureLine(segment,{kind:"gradient",color:toneColor(i,bands.length)});
     if(f)features.push(f);
   }
 }
 return {type:"FeatureCollection",features};
}
function makePlayback(track,time){
 if(!track?.segments)return{data:EMPTY,point:null};
 const features=[];let last=null;
 const all=track.segments;
 for(let index=0;index<all.length;index++){
    const seg=all[index];if(time<seg.start)continue;
    const coords=[];
    for(let j=0;j<seg.times.length;j++){
       if(seg.times[j]>time)break;
       coords.push(seg.coordinates[j]);
    }
    let j=coords.length;
    if(j>0&&j<seg.times.length&&time>seg.times[j-1]&&seg.times[j]>seg.times[j-1]){
       const a=seg.coordinates[j-1],b=seg.coordinates[j];
       const t=(time-seg.times[j-1])/(seg.times[j]-seg.times[j-1]);
       coords.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
    }
    if(coords.length)last=coords[coords.length-1];
    const f=featureLine(coords,{kind:"gradient",color:"rgb("+
      [246-Math.round(index/Math.max(1,all.length-1)*224),151-Math.round(index/Math.max(1,all.length-1)*39),69+Math.round(index/Math.max(1,all.length-1)*22)].join(",")+")"});
    if(f)features.push(f);
 }
 return{data:{type:"FeatureCollection",features},point:last};
}
function routeOverlay(map){
 const source="rs-native-course",ids=["rs-native-rail","rs-native-casing","rs-native-gradient"];
 let current=EMPTY,disposed=false;
 function install(){
   if(disposed||!map.getStyle?.()?.layers)return;
   if(!map.getSource(source))map.addSource(source,{type:"geojson",data:current});
   const below=firstSymbol(map);
   const kinds=[
    {id:ids[0],kind:"rail",paint:{"line-color":"#95a5a0","line-width":["get","width"],"line-opacity":.62}},
    {id:ids[1],kind:"casing",paint:{"line-color":"#fff","line-width":9,"line-opacity":.92}},
    {id:ids[2],kind:"gradient",paint:{"line-color":["get","color"],"line-width":6,"line-opacity":1}}
   ];
   for(const x of kinds)if(!map.getLayer(x.id))map.addLayer({
     id:x.id,type:"line",source,layout:{"line-cap":"round","line-join":"round"},
     filter:["==",["get","kind"],x.kind],paint:x.paint
   },below);
   map.getSource(source)?.setData(current);
 }
 function safeInstall(){try{install()}catch(err){console.warn("RiderSpot route layer deferred",err?.message||err)}}
 map.on("style.load",safeInstall);
 map.on("load",safeInstall);
 return{
   set(data){current=data||EMPTY;safeInstall();},
   remove(){
     disposed=true;map.off("style.load",safeInstall);map.off("load",safeInstall);
     if(!map.getStyle())return;
     try{for(const id of ids.slice().reverse())if(map.getLayer(id))map.removeLayer(id);
       if(map.getSource(source))map.removeSource(source)}catch{}
   }
 };
}

function openNativeSheet(title,body){
 const backdrop=document.createElement("div"),sheet=document.createElement("section"),close=document.createElement("button");
 backdrop.className="rs-sheet-backdrop";sheet.className="rs-map-sheet";
 sheet.setAttribute("role","dialog");sheet.setAttribute("aria-modal","true");
 sheet.setAttribute("aria-label",title||"지도 상세");
 close.type="button";close.className="close";close.textContent="×";
 const overflow=document.body.style.overflow,prior=document.activeElement;
 body.classList.add("rs-sheet-content");
 sheet.append(close,body);backdrop.append(sheet);document.body.append(backdrop);
 document.body.style.overflow="hidden";
 let disposed=false,unregister=null;
 const destroy=()=>{if(disposed)return;disposed=true;unregister?.();backdrop.remove();
   document.body.style.overflow=overflow;document.removeEventListener("keydown",key);
   window.removeEventListener("riderspot:screen",destroy);if(prior?.isConnected)prior.focus()};
 const key=e=>{if(e.key==="Escape"){e.preventDefault();destroy()}};
 close.addEventListener("click",destroy);
 backdrop.addEventListener("click",e=>{if(e.target===backdrop)destroy()});
 document.addEventListener("keydown",key);
 window.addEventListener("riderspot:screen",destroy);
 unregister=window.__rsNavigation?.registerLayer("map-sheet",destroy);
 close.focus();
 return destroy;
}
const statusInfo={
 chat:["💬","대화 환영","이 라이더는 대화를 환영하고 있어요."],
 working:["🛵","배달 중","지금 배달 중이라는 표시예요."],
 break:["☕","잠시 쉬는 중","잠시 쉬고 있다는 표시예요."],
 help:["🤝","도움 가능","도움을 줄 여유가 있다는 표시예요."]
};
function riderIcon(rider){
 const el=document.createElement("div");
 el.className="rs-peer-location rs-native-peer";
 const ico=document.createElement("span");ico.className="rs-peer-scooter";
 ico.innerHTML='<svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M8 18h6l3-6h-6l-3 6M13 12l-1-5h-2m-1 0h4M5 11H3l2 4"/></svg>';
 el.append(ico);
 const badge=statusInfo[rider.presence_status];
 if(badge){const b=document.createElement("span");b.className="rs-peer-presence-badge rs-peer-"+rider.presence_status;b.textContent=badge[0];el.append(b)}
 el.setAttribute("aria-label",(rider.nickname||"라이더")+" · "+(badge?.[1]||"라이더"));
 el.addEventListener("click",e=>{
   e.stopPropagation();
   const body=document.createElement("div");body.className="rs-peer-status-popup";
   const title=document.createElement("strong");title.textContent=rider.nickname||"라이더";
   const state=document.createElement("span");state.textContent=badge?(badge[0]+" "+badge[1]):"상태 표시 안 함";
   const caption=document.createElement("small");caption.textContent=badge?.[2]||"현재 공개된 상태가 없어요.";
   body.append(title,state,caption);
   openNativeSheet(rider.nickname||"라이더",body);
 });
 return el;
}
function iconMarker(map,point,className,html,size=[40,40],anchor=[20,20]){
 const el=document.createElement("div");el.className=className;el.innerHTML=html;
 el.style.width=size[0]+"px";el.style.height=size[1]+"px";
 const gpu=map.__rsPinOverlay;
 // Endpoint markers must render as anchored Korean DOM chips, not the S/E GPU glyphs.
 if(gpu&&!className.includes("rs-v32-endpoint")){
   const id=gpu.id();
   const kind=className.includes("nav-live")?"nav":className.includes("self-location")?"self":
     className.includes("course-start")?"start":className.includes("course-end")?"end":
     className.includes("playback")?"playback":"report";
   const opts={kind,anchor:kind==="self"||kind==="nav"||kind==="playback"?"center":"bottom"};
   let removed=false,coords=ll(point);
   gpu.set(id,coords,opts);
   return{
     getElement(){return el},
     getLngLat(){return{lng:coords[0],lat:coords[1]}},
     setLngLat(v){coords=ll(v);if(!removed)gpu.set(id,coords,opts);return this},
     setBearing(v){opts.bearing=Number.isFinite(+v)?+v:0;if(!removed)gpu.set(id,coords,opts);return this},
     remove(){if(!removed){removed=true;gpu.remove(id)}return this}
   };
 }
 const marker=new (ML().Marker)({element:el,anchor:"center",
   offset:[size[0]/2-anchor[0],size[1]/2-anchor[1]]});
 marker.setLngLat(ll(point)).addTo(map);
 return marker;
}
function installAccuracy(map){
 const id="rs-native-accuracy",fill="rs-native-accuracy-fill",outline="rs-native-accuracy-outline";
 let current=EMPTY,dead=false;
 const setup=()=>{
   if(dead||!map.isStyleLoaded())return;
   if(!map.getSource(id))map.addSource(id,{type:"geojson",data:current});
   if(!map.getLayer(fill))map.addLayer({id:fill,type:"fill",source:id,paint:{"fill-color":"#6d9eff","fill-opacity":.08}});
   if(!map.getLayer(outline))map.addLayer({id:outline,type:"line",source:id,paint:{"line-color":"#5e9afa","line-opacity":.45,"line-width":1}});
   map.getSource(id)?.setData(current);
 };
 map.on("style.load",setup);
 return{
   set(position){if(!valid(position)||!(+position.accuracy>0&&+position.accuracy<=200)){current=EMPTY}else{
     current={type:"FeatureCollection",features:[{type:"Feature",properties:{},
       geometry:{type:"Polygon",coordinates:[circleCoordinates(+position.lat,+position.lng,+position.accuracy)]}}]}
   }if(map.isStyleLoaded())try{setup()}catch{}},
   destroy(){dead=true;map.off("style.load",setup);try{
     for(const layer of [outline,fill])if(map.getLayer(layer))map.removeLayer(layer);
     if(map.getSource(id))map.removeSource(id)}catch{}}
 };
}
function cameraBounds(bounds){
 if(!bounds)return null;
 let sw=typeof bounds.getSouthWest==="function"?bounds.getSouthWest():null;
 let ne=typeof bounds.getNorthEast==="function"?bounds.getNorthEast():null;
 if(!sw||!ne){
   if(Array.isArray(bounds)&&Array.isArray(bounds[0])){sw=llObject(bounds[0]);ne=llObject(bounds[1])}
   else if(Number.isFinite(bounds._southWest?.lat)){sw=bounds._southWest;ne=bounds._northEast}
 }
 if(!valid(sw)||!valid(ne))return null;
 return [[sw.lng,sw.lat],[ne.lng,ne.lat]];
}
window.__rsMapLibreRiderMapFactory=(React,_oldLeaflet,fallback)=>{
 return function NativeRiderMap(props){
  const {position,riders=[],focus=0,course}=props;
  const node=React.useRef(null),state=React.useRef(null);
  const previousFocus=React.useRef(focus),initialFit=React.useRef(course?.fitRequest);
  const courseId=course?.id||"main",isMain=courseId==="main";
  React.useLayoutEffect(()=>{
    if(!ML()||!node.current)return;
    const key=isMain?"rs:map-main-camera-v52":"rs:map-camera:"+courseId;
    const saved=readCamera(key,isMain?null:"rs:map-camera-v48:"+courseId+":1");
    const center=saved?[saved.lng,saved.lat]:[fallback[1],fallback[0]];
    const gl=compatMap(new (ML().Map)({
      container:node.current,
      style:"https://tiles.openfreemap.org/styles/positron",
      center,zoom:saved?.zoom??13,
      minZoom:7.5,maxZoom:19,
      attributionControl:false,
      dragRotate:false,pitchWithRotate:false,rollEnabled:false,
      renderWorldCopies:false,
      fadeDuration:90,
      preserveDrawingBuffer:false
    }));
    gl.dragRotate?.disable();
    gl.touchZoomRotate?.disableRotation();
    const cleanupGpu=window.__rsCreateGpuPinLayer?.(gl)||null;
    gl.getContainer().dataset.rsBasemap="positron";
    gl.getContainer().closest(".map-wrap")?.classList.add("rs-native-map-stage");
    if(!isMain)try{gl.addControl(new (ML().NavigationControl)({showCompass:false,visualizePitch:false}),"top-right")}catch{}
    try{gl.addControl(new (ML().AttributionControl)({compact:true}),"bottom-right")}catch{}
    let alive=true,userInteracted=false,firstGPS=!saved,firstCourseFit=!isMain,frame=0,resize=null;
    const originalRemove=gl.removeLayer.bind(gl);
    const pending={route:routeOverlay(gl),accuracy:installAccuracy(gl)};
    const markers={self:null,start:null,end:null,playback:null,riders:[],stamps:[]};
    const info={gl,alive:()=>alive,isMain,key,pending,markers,
      firstGPS:()=>firstGPS,markGPS:()=>{firstGPS=false},
      userMoved:()=>userInteracted,
      firstCourseFit:()=>firstCourseFit,markFit:()=>{firstCourseFit=false},
      zoomCamera(value){const c=gl.getCenter();gl.jumpTo({center:[c.lng,c.lat],zoom:value})}
    };
    gl.on("style.load",()=>{if(!alive)return;try{polishLabels(gl)}catch(e){console.warn("map labels",e)}});
    const cleanupKorean=window.__rsNativeKoreanLabelInstaller?.(gl)||(()=>{});
    const cleanupStores=isMain?(window.__rsMountStoreClusters?.(gl)||(()=>{})):(()=>{});let mapStyled=false;gl.once("load",()=>{mapStyled=true});const styleGuard=setTimeout(()=>{if(!alive||mapStyled)return;const fallback={version:8,name:"Rider Spot raster fallback",sources:{osm:{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,attribution:"© OpenStreetMap contributors"}},layers:[{id:"osm-base",type:"raster",source:"osm"}]};try{gl.setStyle(fallback);gl.getContainer().dataset.rsBasemap="raster-fallback"}catch(e){console.warn("MapLibre style fallback",e)}},15000);
    const handleUser=()=>{userInteracted=true;if(isMain)window.__rsStartupMainCameraSet=true};
    gl.on("dragstart",handleUser);
    gl.on("touchstart",handleUser);
    gl.on("wheel",handleUser);
    const persist=()=>{if(!alive)return;const c=gl.getCenter();saveCamera(key,{lat:c.lat,lng:c.lng,zoom:gl.getZoom()})};
    gl.on("moveend",persist);
    resize=new ResizeObserver(()=>{if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;if(alive&&node.current?.clientWidth&&node.current?.clientHeight)gl.resize()})});
    resize.observe(node.current);
    state.current=info;
    if(isMain){
      window.__rsMap=gl;
      window.__rsLeaflet=overlayL;
      window.__rsMapNative=true;
      window.__rsMapRiders=riders;
    }
    gl.on("load",()=>{
      if(!alive)return;
      if(isMain)window.dispatchEvent(new Event("riderspot:map"));
    });
    return()=>{
      alive=false;if(frame)cancelAnimationFrame(frame);resize?.disconnect();clearTimeout(styleGuard);
      if(isMain&&window.__rsMap===gl){window.__rsMap=null;window.__rsMapNative=false}
      for(const k of ["self","start","end","playback"])markers[k]?.remove();
      for(const group of ["riders","stamps"])for(const m of markers[group])m.remove();
      cleanupStores();cleanupKorean();pending.route.remove();pending.accuracy.destroy();cleanupGpu?.destroy();
      gl.off("moveend",persist);gl.remove();state.current=null;
    };
  },[courseId]);
  React.useEffect(()=>{
    const s=state.current;if(!s||!valid(position))return;
    const {gl,markers,pending}=s;
    if(isMain)window.__rsMapPosition=position;
    if(course&&!course.live)return;
    if(isMain){
      if(focus!==previousFocus.current){
        previousFocus.current=focus;s.markGPS();
        gl.jumpTo({center:[+position.lng,+position.lat],zoom:16});
      }else if(s.firstGPS()&&!s.userMoved()&&!window.__rsStartupMainCameraSet){
        s.markGPS();gl.jumpTo({center:[+position.lng,+position.lat],zoom:16});
      }
    }
    const className=course?.live?"rs-nav-live-location":"rs-self-location";
    if(!markers.self){
      const html=course?.live
       ?'<span class="rs-nav-bearing"><span class="rs-nav-cone"></span></span><span class="rs-nav-halo"></span><span class="rs-nav-dot"></span>'
       :'<span class="rs-self-halo"></span><span class="rs-self-arrow"></span><span class="rs-self-dot"></span>';
      markers.self=iconMarker(gl,position,className,html,course?.live?[48,48]:[38,38],course?.live?[24,24]:[19,19]);
    }else markers.self.setLngLat([+position.lng,+position.lat]);
    if(course?.live){
      const element=markers.self.getElement(),stale=Date.now()-Number(position.t||position.timestamp||0)>30000;
      element.classList.toggle("rs-nav-stale",stale);
      const heading=Number(position.heading);
      element.classList.toggle("rs-nav-has-heading",Number.isFinite(heading)&&heading>=0&&!stale);
      if(Number.isFinite(heading))element.style.setProperty("--rs-nav-heading",heading+"deg");
      markers.self?.setBearing?.(Number.isFinite(heading)&&!stale?heading:0);
    }
    pending.accuracy.set(position);
  },[courseId,position,focus,course?.live]);
  React.useEffect(()=>{
    const s=state.current;if(!s||!isMain)return;
    function draw(){
      const gpu=s.gl.__rsPinOverlay;
      const visible=window.__rsLayerFlags?.riders!==false;
      if(gpu){
        gpu.setGroup("riders",visible?(riders||[]).filter(valid).map((rider,index)=>({
          id:String(rider.id||rider.user_id||rider.nickname||index),
          lng:+rider.lng,lat:+rider.lat,kind:"rider",
          status:rider.presence_status||"",
          onClick:()=>riderIcon(rider).click()
        })):[]);
        return;
      }
      for(const m of s.markers.riders)m.remove();
      s.markers.riders=[];
      if(!visible)return;
      for(const rider of riders||[]){
        if(!valid(rider))continue;
        const el=riderIcon(rider);
        const m=new (ML().Marker)({element:el,anchor:"center"}).setLngLat([+rider.lng,+rider.lat]).addTo(s.gl);
        s.markers.riders.push(m);
      }
    }
    window.__rsMapRiders=riders;
    draw();
    window.dispatchEvent(new Event("riderspot:map"));
    window.addEventListener("riderspot:layer-changed",draw);
    return()=>window.removeEventListener("riderspot:layer-changed",draw);
  },[courseId,riders]);
  React.useEffect(()=>{
    const s=state.current;if(!s||!course?.bounds)return;
    const bounds=cameraBounds(course.bounds),explicit=initialFit.current!==course.fitRequest;
    initialFit.current=course.fitRequest;
    if(!bounds)return;
    const first=s.firstCourseFit();s.markFit();
    if(!explicit&&!first)return;
    try{s.gl.fitBounds(bounds,{padding:{top:45,bottom:66,left:45,right:45},maxZoom:16,duration:0})}catch(e){console.warn("course fit bounds",e)}
  },[courseId,course?.bounds,course?.fitRequest]);
  React.useEffect(()=>{
    const s=state.current;if(!s||!course?.live||!course.follow||!valid(position))return;
    const gl=s.gl;gl.jumpTo({center:[+position.lng,+position.lat],zoom:Math.max(17,gl.getZoom())});
  },[courseId,course?.live,course?.follow,position?.lat,position?.lng]);
  React.useEffect(()=>{
    const s=state.current;if(!s||!course?.live||!course.onUnfollow)return;
    const fn=()=>course.onUnfollow();
    s.gl.on("dragstart",fn);
    return()=>s.gl.off("dragstart",fn);
  },[courseId,course?.live,course?.onUnfollow]);
  React.useEffect(()=>{
    const s=state.current;if(!s||!course)return;
    const {gl,markers}=s;
    // Keep GPS coordinates immutable. Only the screen-space label badges
    // shift apart for a start and finish within 38 metres.
    for(const kind of ["start","end"]){markers[kind]?.remove();markers[kind]=null}
    const paths=course?.geometry?.paths||[];
    const firstPath=paths.find(path=>Array.isArray(path)&&path.length);
    const lastPath=paths.findLast(path=>Array.isArray(path)&&path.length);
    const fallbackStart=firstPath?.[0];
    const fallbackEnd=lastPath?.at(-1);
    const start=valid(course.startPoint)?course.startPoint:
      Array.isArray(fallbackStart)?{lat:fallbackStart[0],lng:fallbackStart[1]}:null;
    const end=course.live?null:valid(course.endPoint)?course.endPoint:
      Array.isArray(fallbackEnd)?{lat:fallbackEnd[0],lng:fallbackEnd[1]}:null;
    const close=!!(start&&end&&Math.hypot(
      (Number(start.lat)-Number(end.lat))*111195,
      (Number(start.lng)-Number(end.lng))*111195*Math.cos(Number(start.lat)*Math.PI/180)
    )<38);
    const make=(point,kind)=>{
      const isStart=kind==="start",text=isStart?"시작":"종료";
      const html='<span class="rs-v32-anchor"></span><span class="rs-v32-chip">'+
        '<span class="rs-v32-glyph" aria-hidden="true">'+(isStart?"▶":"■")+'</span>'+
        '<span class="rs-v32-caption">'+text+'</span></span>';
      const layer=iconMarker(gl,point,
        "rs-v32-endpoint rs-v32-"+kind+(close?" rs-v32-near":""),
        html,[104,44],[52,22]);
      layer.getElement()?.setAttribute("aria-label","운행 "+text+" 지점");
      return layer;
    };
    if(start)markers.start=make(start,"start");
    if(end)markers.end=make(end,"end");
    return()=>{for(const kind of ["start","end"]){markers[kind]?.remove();markers[kind]=null}};
  },[courseId,course?.startPoint?.lat,course?.startPoint?.lng,
    course?.endPoint?.lat,course?.endPoint?.lng,
    course?.geometry,course?.live]);
  React.useEffect(()=>{
    const s=state.current;if(!s)return;
    const track=course?.playback?.track;
    const showing=course?.playback?.showing&&track;
    const frame=showing?makePlayback(track,Number(course.playback.elapsed)||0):null;
    s.pending.route.set(frame?frame.data:makeRoute(course?.geometry));
    if(frame?.point){
      if(!s.markers.playback){
        s.markers.playback=iconMarker(s.gl,frame.point,"rs-native-playback-marker",
          '<span class="rs-native-playback-dot"></span>',[22,22],[11,11]);
      }else s.markers.playback.setLngLat(ll(frame.point));
    }else{
      s.markers.playback?.remove();s.markers.playback=null;
    }
  },[courseId,course?.geometry,course?.playback?.track,course?.playback?.showing,course?.playback?.elapsed]);
  React.useEffect(()=>{
    const s=state.current;if(!s)return;
    for(const marker of s.markers.stamps)marker.remove();
    s.markers.stamps=[];
    if(!course?.stamps?.length)return;
    const showing=Boolean(course?.playback?.showing);
    const track=course?.playback?.track,elapsed=Number(course?.playback?.elapsed)||0;let latest=Infinity;if(showing){latest=0;const windows=track?.windows||[];let active=windows[0];for(const w of windows){if(elapsed>=w.offset)active=w;else break}if(active)latest=active.start+Math.min(active.duration,Math.max(0,elapsed-active.offset))}
    for(const stamp of course.stamps){
      if(!valid(stamp)||showing&&+stamp.time>latest)continue;
      const el=document.createElement("span");
      el.className="rs33-stamp-label "+(stamp.kind||"stamp");
      const dt=new Date(stamp.time);
      el.textContent=Number.isFinite(dt.getTime())?dt.toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}):"정차";
      el.title=stamp.label||"운행 기록";
      const gpu=s.gl.__rsPinOverlay;
      let m;
      if(gpu){
        const id=gpu.id();
        gpu.set(id,[+stamp.lng,+stamp.lat],{kind:"stamp",name:el.textContent,
          onClick:()=>course.onStamp?.(stamp)});
        m={remove(){gpu.remove(id)}};
      }else{
        m=new (ML().Marker)({element:el,anchor:"bottom"}).setLngLat([+stamp.lng,+stamp.lat]).addTo(s.gl);
      }
      el.addEventListener("click",e=>{e.stopPropagation();course.onStamp?.(stamp)});
      s.markers.stamps.push(m);
    }
  },[courseId,course?.stamps,course?.playback?.showing,course?.playback?.elapsed,course?.onStamp]);
  return React.createElement("div",{className:"map rs-maplibre-native",ref:node,
    "aria-label":course?"운행 경로 지도":"주변 지도"});
 };
};
})();