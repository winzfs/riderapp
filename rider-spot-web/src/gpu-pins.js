(()=>{
"use strict";
const KEY="rs-native-pin-engine-v24",EMPTY={type:"FeatureCollection",features:[]};
let uniqueId=0;
const nextId=()=>KEY+"-"+(++uniqueId);
const PALETTE={toilet:"#266bab",road:"#d18343",report:"#367e70",rider:"#3066a0",self:"#377de8",start:"#167961",end:"#bb5c5b",shop:"#ffffff"};
function rounded(ctx,x,y,w,h,r){
 const q=Math.min(r,w/2,h/2);
 ctx.beginPath();ctx.moveTo(x+q,y);ctx.arcTo(x+w,y,x+w,y+h,q);
 ctx.arcTo(x+w,y+h,x,y+h,q);ctx.arcTo(x,y+h,x,y,q);
 ctx.arcTo(x,y,x+w,y,q);ctx.closePath();
}
function canvasFor(pin){
 const kind=pin.kind||"report",shop=kind==="shop";
 const label=String(pin.name||"매장");
 const count=Math.max(1,Number(pin.count)||1);
 const temp=document.createElement("canvas"),measure=temp.getContext("2d");
 if(!measure)return null;
 measure.font="700 11px system-ui, sans-serif";
 const short=label.length>15?label.slice(0,14)+"…":label;
 const width=shop?Math.min(225,Math.max(86,Math.ceil(measure.measureText(short).width)+58+(count>1?40:0))):kind==="stamp"?Math.max(58,Math.ceil(measure.measureText(label).width)+15):kind==="self"||kind==="nav"||kind==="playback"?62:kind==="rider"?48:48;
 const height=shop?44:kind==="self"||kind==="nav"||kind==="playback"?62:kind==="stamp"?37:51;
 const scale=2;
 temp.width=width*scale;temp.height=height*scale;
 const ctx=temp.getContext("2d");
 ctx.scale(scale,scale);
 const w=width,h=height;
 ctx.shadowColor="rgba(22,43,61,.18)";ctx.shadowBlur=7;ctx.shadowOffsetY=2;
 if(shop){
   ctx.fillStyle="#fff";ctx.strokeStyle="#c8d7e1";ctx.lineWidth=1;
   rounded(ctx,2,3,w-4,35,11);ctx.fill();ctx.shadowColor="transparent";ctx.stroke();
   ctx.fillStyle="#eaf2f4";rounded(ctx,6,8,23,24,7);ctx.fill();
   ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="700 16px system-ui";ctx.fillStyle="#2c7181";ctx.fillText("⌂",17.5,20);
   ctx.textAlign="left";ctx.font="700 11px system-ui";ctx.fillStyle="#31505e";
   ctx.fillText(short,35,21);
   if(count>1){
     ctx.fillStyle="#dce8ff";rounded(ctx,w-40,9,33,22,7);ctx.fill();
     ctx.textAlign="center";ctx.font="800 10px system-ui";ctx.fillStyle="#3564c1";ctx.fillText(count+"",w-23.5,20);
   }
 }else if(kind==="self"||kind==="nav"||kind==="playback"){
   ctx.shadowColor="transparent";ctx.fillStyle=kind==="self"||kind==="nav"?"rgba(72,136,242,.17)":"rgba(31,122,97,.10)";
   ctx.beginPath();ctx.arc(w/2,h/2,kind==="self"||kind==="nav"?27:23,0,Math.PI*2);ctx.fill();
   ctx.strokeStyle="#fff";ctx.lineWidth=3;ctx.fillStyle=kind==="self"||kind==="nav"?"#3184f4":"#167e67";
   ctx.beginPath();ctx.arc(w/2,h/2,kind==="self"||kind==="nav"?12:10,0,Math.PI*2);ctx.fill();ctx.stroke();
   if(kind==="nav"){ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(w/2,h/2-8);ctx.lineTo(w/2-5,h/2+6);ctx.lineTo(w/2,h/2+3);ctx.lineTo(w/2+5,h/2+6);ctx.closePath();ctx.fill()}else{ctx.beginPath();ctx.arc(w/2,h/2,4,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill()}
 }else if(kind==="stamp"){
   ctx.fillStyle="#fff";ctx.strokeStyle="#ced9df";ctx.lineWidth=1;
   rounded(ctx,2,3,w-4,28,9);ctx.fill();ctx.shadowColor="transparent";ctx.stroke();
   ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="700 11px system-ui";ctx.fillStyle="#425764";ctx.fillText(label,w/2,17);
 }else{
   const color=PALETTE[kind]||PALETTE.report;
   ctx.fillStyle=color;ctx.strokeStyle="#fff";ctx.lineWidth=2.5;
   rounded(ctx,6,3,w-12,35,9);ctx.fill();ctx.stroke();
   ctx.shadowColor="transparent";
   ctx.beginPath();ctx.moveTo(w/2-7,37);ctx.lineTo(w/2+7,37);ctx.lineTo(w/2,47);ctx.closePath();
   ctx.fillStyle=color;ctx.fill();
   ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(w/2-7,37);ctx.lineTo(w/2,47);ctx.lineTo(w/2+7,37);ctx.stroke();
   ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="#fff";
   ctx.font=(kind==="toilet"?"850 15px":kind==="rider"?"900 20px":"850 17px")+" system-ui, sans-serif";
   const text=kind==="toilet"?"WC":kind==="road"?"!":kind==="rider"?"↗":kind==="start"?"S":kind==="end"?"E":"●";
   ctx.fillText(text,w/2,20);
 }
 return{data:ctx.getImageData(0,0,temp.width,temp.height),pixelRatio:scale};
}
function create(gl){
 const SOURCE="rs-native-gpu-pins",BOTTOM="rs-native-gpu-bottom",CENTER="rs-native-gpu-center";
 const byId=new Map(),groups=new Map(),imageKey=new Map();
 let pending=0,alive=true,ready=false,imageCounter=0;
 const getStyle=()=>Boolean(gl.getStyle?.()?.layers);
 function imageName(pin){
   const key=pin.kind==="shop"?"shop|"+pin.name+"|"+pin.count:pin.kind==="stamp"?"stamp|"+pin.name:pin.kind||"report";
   if(imageKey.has(key))return imageKey.get(key);
   const id="rs-gpu-icon-"+(++imageCounter);
   imageKey.set(key,id);
   return id;
 }
 function ensure(){
   if(!alive||!getStyle())return false;
   try{
     if(!gl.getSource(SOURCE))gl.addSource(SOURCE,{type:"geojson",data:EMPTY});
     for(const item of byId.values()){
       const img=imageName(item);
       if(!gl.hasImage(img)){
         const drawn=canvasFor(item);
         if(drawn)gl.addImage(img,drawn.data,{pixelRatio:drawn.pixelRatio});
       }
     }
     const layers=[
       [BOTTOM,"bottom"],[CENTER,"center"]
     ];
     for(const [id,anchor] of layers)if(!gl.getLayer(id)){
       gl.addLayer({id,type:"symbol",source:SOURCE,
        filter:["==",["get","anchor"],anchor],
        layout:{"icon-image":["get","image"],"icon-anchor":anchor,
          "icon-size":1,"icon-rotate":["get","bearing"],"icon-rotation-alignment":"map","icon-allow-overlap":true,"icon-ignore-placement":true,
          "icon-optional":false,"icon-padding":0,
          "symbol-sort-key":["get","order"]},
        paint:{"icon-opacity":1}
       });
     }
     ready=true;return true;
   }catch(e){ready=false;console.warn("RiderSpot GPU pins install",e?.message||e);return false}
 }
 function update(){
   pending=0;if(!alive)return;
   if(!ensure())return;
   try{
     const features=[];
     for(const pin of byId.values()){
       const lng=+pin.lng,lat=+pin.lat;
       if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lat)>90||Math.abs(lng)>180)continue;
       features.push({type:"Feature",properties:{
         id:pin.id,image:imageName(pin),anchor:pin.anchor||((pin.kind==="self"||pin.kind==="nav"||pin.kind==="playback")?"center":"bottom"),
         bearing:Number.isFinite(+pin.bearing)?+pin.bearing:0,order:pin.kind==="self"||pin.kind==="nav"?90:pin.kind==="rider"?70:pin.kind==="toilet"?60:pin.kind==="shop"?20:40
       },geometry:{type:"Point",coordinates:[lng,lat]}});
     }
     gl.getSource(SOURCE)?.setData({type:"FeatureCollection",features});
     if(imageKey.size>120){
       const active=new Set([...byId.values()].map(imageName));
       for(const [key,id] of [...imageKey]){
         if(active.has(id))continue;
         try{if(gl.hasImage(id))gl.removeImage(id)}catch{}
         imageKey.delete(key);
       }
     }
     window.__rsGpuPinStats={version:KEY,count:features.length,images:imageKey.size};
   }catch(e){console.warn("RiderSpot GPU pins update",e?.message||e)}
 }
 function schedule(){
   if(!alive||pending)return;
   pending=window.requestAnimationFrame?window.requestAnimationFrame(update):setTimeout(update,16);
 }
 function set(id,coords,opts={}){
   if(!alive)return;
   const loc=Array.isArray(coords)?coords:[coords.lng,coords.lat];
   if(!Number.isFinite(+loc[0])||!Number.isFinite(+loc[1]))return;
   byId.set(String(id),{id:String(id),lng:+loc[0],lat:+loc[1],...opts});
   schedule();
 }
 function del(id){if(byId.delete(String(id)))schedule()}
 function setGroup(group,items){
   const ids=new Set();
   for(const item of items||[]){
     const id=group+":"+item.id;
     const loc=Array.isArray(item.position)?item.position:[item.lng,item.lat];
     if(!Number.isFinite(+loc[0])||!Number.isFinite(+loc[1]))continue;
     ids.add(id);
     byId.set(id,{...item,id,lng:+loc[0],lat:+loc[1]});
   }
   for(const id of groups.get(group)||[])if(!ids.has(id))byId.delete(id);
   groups.set(group,ids);schedule();
 }
 function clearGroup(group){
   for(const id of groups.get(group)||[])byId.delete(id);
   groups.delete(group);schedule();
 }
 function findTarget(point){
   const ids=[BOTTOM,CENTER].filter(id=>gl.getLayer(id));
   if(!ids.length)return null;
   try{
     const hits=gl.queryRenderedFeatures(point,{layers:ids});
     for(const hit of hits){
       const pin=byId.get(String(hit.properties?.id));
       if(pin?.onClick)return pin;
     }
   }catch{}
   return null;
 }
 function click(e){
   if(!alive||gl.getContainer()?.closest(".rs-map-picking"))return;
   const hit=findTarget(e.point);
   if(hit){e.originalEvent?.stopPropagation?.();hit.onClick(e,hit)}
 }
 function pointer(e){
   const canvas=gl.getCanvas?.();if(!canvas)return;
   if(gl.getContainer()?.closest(".rs-map-picking"))return;
   canvas.style.cursor=findTarget(e.point)?"pointer":"";
 }
 function onStyle(){
   ready=false;
   if(!alive)return;
   if(pending){window.cancelAnimationFrame?.(pending);pending=0}
   schedule();
 }
 gl.on("style.load",onStyle);
 gl.on("click",click);
 gl.on("mousemove",pointer);
 if(gl.isStyleLoaded?.())schedule();
 const api={set,remove:del,setGroup,clearGroup,
  id:nextId,
  get count(){return byId.size},
  get ready(){return ready},
  destroy(){
    alive=false;
    if(pending){window.cancelAnimationFrame?.(pending);clearTimeout(pending);pending=0}
    gl.off("style.load",onStyle);gl.off("click",click);gl.off("mousemove",pointer);
    const canvas=gl.getCanvas?.();if(canvas)canvas.style.cursor="";
    if(getStyle())try{
      for(const id of [BOTTOM,CENTER])if(gl.getLayer(id))gl.removeLayer(id);
      if(gl.getSource(SOURCE))gl.removeSource(SOURCE);
      for(const id of imageKey.values())if(gl.hasImage(id))gl.removeImage(id);
    }catch{}
    byId.clear();groups.clear();imageKey.clear();
  }};
 gl.__rsPinOverlay=api;
 return api;
}
window.__rsCreateGpuPinLayer=create;
})();