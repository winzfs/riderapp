import { rs33CourseToneColor } from "./course-layers.mjs";
import { buildPlaybackColorSlices, playbackFrame } from "./route-playback.mjs";

// Draw a completed ride INSIDE MapLibre, above roads and BELOW the first
// basemap text symbol. This avoids Leaflet's overlay pane painting GPS lines
// over Korean neighbourhood names. The original GPS geometry is read-only.
const SOURCE = "rs-course-route-source";
const LAYERS = ["rs-course-rail", "rs-course-casing", "rs-course-gradient"];
const EMPTY = {type:"FeatureCollection",features:[]};
const valid = c => Array.isArray(c) && c.length >= 2 &&
  Number.isFinite(c[0]) && Number.isFinite(c[1]);
const coordinates = pairs => (pairs || []).filter(valid).map(([lat,lng]) => [lng,lat]);
const feature = (kind, pairs, extra = {}) => ({
  type:"Feature",
  properties:{kind,...extra},
  geometry:{type:"LineString",coordinates:coordinates(pairs)},
});

export function vectorCourseGeometry(geometry) {
  if (!geometry) return EMPTY;
  const features = [];
  // Revisit outlines and their pale inner bands retain the established route theme.
  for (let level = 3; level >= 1; level--) {
    const rails = (geometry.railRuns || []).slice(level + 1).flat();
    for (const rail of rails) if (rail?.length >= 2) {
      features.push(feature("rail",rail,{width:7+4*level}));
    }
  }
  for (const path of geometry.paths || []) if(path?.length>=2) {
    features.push(feature("casing",path));
  }
  for (let tone=0;tone<(geometry.gradient||[]).length;tone++) {
    for (const segment of geometry.gradient[tone] || []) {
      if(segment?.length>=2)features.push(feature("gradient",segment,{
        color:rs33CourseToneColor(tone),
      }));
    }
  }
  return {type:"FeatureCollection",features};
}

// The route is registered before the first symbol layer, so MapLibre redraws
// administrative, road and neighbourhood text ABOVE the route.
export function mountVectorCourse(gl, initial = EMPTY) {
  let disposed=false;
  let data=initial;
  function install() {
    if(disposed || !gl.getStyle?.()?.layers) return;
    if (!gl.getSource(SOURCE)) gl.addSource(SOURCE,{type:"geojson",data});
    const firstLabel=gl.getStyle().layers.find(layer=>layer.type==="symbol")?.id;
    const styles=[
      {id:LAYERS[0],filter:["==",["get","kind"],"rail"],
       paint:{"line-color":"#95a5a0","line-width":["get","width"],"line-opacity":0.62}},
      {id:LAYERS[1],filter:["==",["get","kind"],"casing"],
       paint:{"line-color":"#ffffff","line-width":9,"line-opacity":0.92}},
      {id:LAYERS[2],filter:["==",["get","kind"],"gradient"],
       paint:{"line-color":["get","color"],"line-width":6,"line-opacity":1}},
    ];
    for(const layer of styles)if(!gl.getLayer(layer.id)){
      gl.addLayer({id:layer.id,type:"line",source:SOURCE,
        layout:{"line-cap":"round","line-join":"round"},
        filter:layer.filter,paint:layer.paint},firstLabel);
    }
    gl.getSource(SOURCE)?.setData(data);
  }
  gl.on?.("style.load",install);
  try{install()}catch(e){
    gl.off?.("style.load",install);
    throw e;
  }
  return {
    setData(next){data=next;gl.getSource(SOURCE)?.setData(data)},
    destroy(){
      disposed=true;
      gl.off?.("style.load",install);
      try{
        for(const id of [...LAYERS].reverse())if(gl.getLayer(id))gl.removeLayer(id);
        if(gl.getSource(SOURCE))gl.removeSource(SOURCE);
      }catch{
        // A map or style may already have been torn down during tab switching.
      }
    },
  };
}

function upperBound(times,time){
  let low=0,high=times.length;
  while(low<high){const mid=(low+high)>>>1;if(times[mid]<=time)low=mid+1;else high=mid}
  return low;
}

export function vectorPlaybackGeometry(parts,time) {
  const features=[];
  for(const slice of parts){
    if(time<slice.times[0])continue;
    let coords=slice.lngLat;
    if(time<slice.times.at(-1)){
      const idx=upperBound(slice.times,time)-1;
      const next=idx+1;
      coords=slice.lngLat.slice(0,idx+1);
      if(next<slice.times.length && time>slice.times[idx] && slice.times[next]>slice.times[idx]){
        const ratio=(time-slice.times[idx])/(slice.times[next]-slice.times[idx]);
        const a=slice.lngLat[idx],b=slice.lngLat[next];
        coords.push([a[0]+(b[0]-a[0])*ratio,a[1]+(b[1]-a[1])*ratio]);
      }
    }
    if(coords.length>1)features.push({
      type:"Feature",properties:{kind:"gradient",color:slice.color},
      geometry:{type:"LineString",coordinates:coords},
    });
  }
  return {type:"FeatureCollection",features};
}

export function createVectorPlaybackLayer(L, leafletMap, gl, track) {
  const parts=buildPlaybackColorSlices(track).map(slice=>({
    times:slice.times,
    lngLat:coordinates(slice.coordinates),
    color:rs33CourseToneColor(slice.tone),
  }));
  const source=mountVectorCourse(gl,EMPTY);
  const marker=L.circleMarker([0,0],{
    radius:8,color:"#ffffff",weight:3,fillColor:"#0c705b",
    fillOpacity:1,opacity:1,interactive:false,
    className:"rs59-playback-marker",
  });
  let shown=false;
  return {
    setTime(elapsed){
      const time=Math.max(0,Math.min(track.duration,Number(elapsed)||0));
      source.setData(vectorPlaybackGeometry(parts,time));
      const point=playbackFrame(track,time).point;
      if(point){
        marker.setLatLng(point);
        if(!shown){marker.addTo(leafletMap);shown=true}
      }else if(shown){marker.remove();shown=false}
    },
    destroy(){if(shown)marker.remove();source.destroy()},
  };
}
