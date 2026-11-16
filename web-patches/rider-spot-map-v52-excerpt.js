function Zo({position:e,riders:t=rs33NoRiders,points:n=rs33NoRiders,focus:r=0,course}){let i=(0,S.useRef)(null),a=(0,S.useRef)(null),o=(0,S.useRef)(null),autocenter=(0,S.useRef)(!1),selfMarker=(0,S.useRef)(null),selfAccuracy=(0,S.useRef)(null),rs48CameraFocus=(0,S.useRef)(r),rs48IsCourse=(0,S.useRef)(Boolean(course)),rs52HadRestore=(0,S.useRef)(false);rs48CameraFocus.current=r;rs48IsCourse.current=Boolean(course);return(0,S.useEffect)(()=>{const rs52Key=rs48IsCourse.current?'rs:map-camera-v48:'+String(rs48CameraFocus.current):'rs:map-main-camera-v52';
let rs52Saved=null;
try{const prev=JSON.parse(sessionStorage.getItem(rs52Key)||localStorage.getItem(rs52Key)||'null');
if(prev&&Date.now()-Number(prev.t)<21600000&&Number.isFinite(prev.lat)&&Number.isFinite(prev.lng)&&Number.isFinite(prev.zoom)&&Math.abs(prev.lat)<=90&&Math.abs(prev.lng)<=180)rs52Saved=prev;}catch(err){}
rs52HadRestore.current=!!rs52Saved;
let e=Jo.default.map(i.current,{zoomControl:!1,minZoom:7.5,maxZoom:19,zoomSnap:0,zoomDelta:.25,touchZoom:!0,bounceAtZoomLimits:!1,zoomAnimation:!0}).setView(rs52Saved?[rs52Saved.lat,rs52Saved.lng]:Xo,rs52Saved?Math.max(7.5,Math.min(19,rs52Saved.zoom)):13);a.current=e,window.__rsLeaflet=Jo.default,window.__rsMap=e,window.__rsPendingMapCenter&&setTimeout(()=>{const p=window.__rsPendingMapCenter;if(p){window.__rsPendingMapCenter=null;e.setView(p,16)}},400),(window.__rsMinimalBase?.(Jo.default,e)||Jo.default.tileLayer(`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`,{attribution:`© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>`,maxZoom:19}).addTo(e)),Jo.default.control.zoom({position:`topright`}).addTo(e),o.current=Jo.default.layerGroup().addTo(e);
 const rs48SaveCamera=()=>{
 const center=e.getCenter(),zoom=e.getZoom();
 if(!center||!Number.isFinite(center.lat)||!Number.isFinite(center.lng)||!Number.isFinite(zoom))return;
 const key=rs48IsCourse.current?'rs:map-camera-v48:'+String(rs48CameraFocus.current):'rs:map-main-camera-v52';
 const data=JSON.stringify({lat:center.lat,lng:center.lng,zoom,t:Date.now()});
 try{sessionStorage.setItem(key,data);localStorage.setItem(key,data);}catch(err){}
 };
 e.on('moveend zoomend',rs48SaveCamera);
 let t=new ResizeObserver(()=>e.invalidateSize());
 return t.observe(i.current),()=>{rs48SaveCamera();e.off('moveend zoomend',rs48SaveCamera);t.disconnect();e.remove()}},[]),(0,S.useEffect)(()=>{let r=o.current;if(!r)return;r.clearLayers(),window.__rsMapPosition=e,window.__rsMapRiders=t,window.dispatchEvent(new Event('riderspot:map')),t.forEach(peer=>{
if(!Number.isFinite(Number(peer.lat))||!Number.isFinite(Number(peer.lng)))return;
const badges={chat:["💬","대화 환영"],working:["🛵","배달 중"],break:["☕","잠시 쉬는 중"],help:["🤝","도움 가능"]};
const code=String(peer.presence_status||"none"),badge=badges[code]||null;
Jo.default.circle([peer.lat,peer.lng],{radius:90,color:"#339f73",weight:1,fillColor:"#50c29b",fillOpacity:.10}).addTo(r);
const html="<span class='rs-peer-scooter'>🛵</span>"+(badge?"<span class='rs-peer-presence-badge rs-peer-"+code+"'>"+badge[0]+"</span>":"");
const pin=Jo.default.marker([peer.lat,peer.lng],{icon:Jo.default.divIcon({className:"rs-peer-location",html,iconSize:[40,40],iconAnchor:[20,20]})}).addTo(r);
const popup=document.createElement("div");popup.className="rs-peer-status-popup";
const title=document.createElement("strong");title.textContent=peer.nickname;popup.append(title);
const badgeText=document.createElement("span");badgeText.textContent=badge?badge[0]+" "+badge[1]:"상태 표시 안 함";popup.append(badgeText);
const explanation=document.createElement("small");explanation.textContent=code==="chat"?"이 라이더는 대화를 환영하고 있어요.":code==="help"?"도움을 줄 여유가 있다는 표시예요.":code==="break"?"지금 잠시 쉬고 있다는 표시예요.":code==="working"?"지금 배달 중이라는 표시예요.":"현재 공개된 상태가 없어요.";popup.append(explanation);
pin.bindPopup(popup,{offset:[0,-12]});
});
if(course)return rs33DrawCourse(Jo.default,a.current,r,course.groups,course.stamps,course.onStamp,course.revisits);
},[e,t,n,course?.groups,course?.stamps]),(0,S.useEffect)(()=>{const map=a.current;if(!map)return;
if(!e||!Number.isFinite(Number(e.lat))||!Number.isFinite(Number(e.lng)))return;
const pt=[Number(e.lat),Number(e.lng)];
if(!selfMarker.current){
 const icon=Jo.default.divIcon({className:"rs-self-location",html:'<span class="rs-self-halo"></span><span class="rs-self-arrow"></span><span class="rs-self-dot"></span>',iconSize:[38,38],iconAnchor:[19,19]});
 selfMarker.current=Jo.default.marker(pt,{icon,zIndexOffset:6500,interactive:true}).addTo(map).bindTooltip("내 위치 · 나에게만 표시",{direction:"top",offset:[0,-19]});
}else selfMarker.current.setLatLng(pt);
if(Number.isFinite(Number(e.accuracy))&&e.accuracy>0&&e.accuracy<=200){
 if(!selfAccuracy.current)selfAccuracy.current=Jo.default.circle(pt,{radius:Math.min(200,Number(e.accuracy)),weight:1,color:"#5e9afa",fillColor:"#6d9eff",fillOpacity:.08,opacity:.45,interactive:false,className:"rs-gps-accuracy"}).addTo(map);
 else selfAccuracy.current.setLatLng(pt).setRadius(Math.min(200,Number(e.accuracy)));
}else if(selfAccuracy.current){map.removeLayer(selfAccuracy.current);selfAccuracy.current=null}
},[e?.lat,e?.lng,e?.accuracy]),(0,S.useEffect)(()=>{const points=course?course.fit:n;
let rs48Restored=false;
if(course){
 try{
  const saved=JSON.parse((sessionStorage.getItem('rs:map-camera-v48:'+String(r))||localStorage.getItem('rs:map-camera-v48:'+String(r)))||'null');
  if(saved&&saved.t>Date.now()-21600000&&Number.isFinite(saved.lat)&&Number.isFinite(saved.lng)
   &&Number.isFinite(saved.zoom)&&Math.abs(saved.lat)<=90&&Math.abs(saved.lng)<=180){
   a.current.setView([saved.lat,saved.lng],Math.max(7.5,Math.min(19,saved.zoom)),{animate:false});
   rs48Restored=true;
  }
 }catch(err){}
}
if(!rs48Restored){
 if(points.length)a.current.fitBounds(points.map(p=>[p.lat,p.lng]),{padding:[45,66],maxZoom:16});
 else if(e)a.current.setView([e.lat,e.lng],15);
}
},[r]),(0,S.useEffect)(()=>{
 const chosen=course?.focused;
 if(chosen&&a.current)a.current.setView([chosen.lat,chosen.lng],Math.max(a.current.getZoom(),16));
},[course?.focused]),(0,S.useEffect)(()=>{if(course||rs52HadRestore.current||!e||autocenter.current||!a.current||!Number.isFinite(Number(e.lat))||!Number.isFinite(Number(e.lng)))return;autocenter.current=!0;a.current.setView([e.lat,e.lng],16)},[e?.lat,e?.lng]),(0,J.jsx)(`div`,{className:`map`,ref:i,"aria-label":course?`운행 경로 지도`:`주변 지도`})}
// Basemap state in same live bundled asset:
const state={mode:window.__rsNativeInstalled?"classic":getMode(),osm,gl:null,glMap:null,alive:true,loading:false,hasGl:false,creditAdded:false};
   if(wrap){wrap.classLis
