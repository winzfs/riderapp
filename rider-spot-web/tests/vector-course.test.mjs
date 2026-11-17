import test from "node:test";
import assert from "node:assert/strict";
import {vectorCourseGeometry, mountVectorCourse, vectorPlaybackGeometry} from "../src/vector-course.mjs";
import {routeGeometry} from "../src/route-analysis.mjs";

function fakeGL(){
  const layers=[{id:"background",type:"background"},{id:"roads",type:"line"},
                {id:"major-place-names",type:"symbol"},{id:"neighbourhood-names",type:"symbol"}];
  const sources=new Map(),events=new Map();
  const history=[];
  return {
    history,
    getStyle:()=>({layers}),
    getSource:id=>sources.get(id),
    getLayer:id=>layers.find(layer=>layer.id===id),
    addSource(id,source){
      const handler={setData(data){this.data=data;history.push(["data",id,data.features.length]);},data:source.data};
      sources.set(id,handler);
    },
    addLayer(layer,before){
      const where=layers.findIndex(item=>item.id===before);
      layers.splice(where===-1?layers.length:where,0,layer);
      history.push(["layer",layer.id,before]);
    },
    removeLayer(id){const index=layers.findIndex(layer=>layer.id===id);if(index>=0)layers.splice(index,1);},
    removeSource:id=>sources.delete(id),
    on(name,fn){events.set(name,fn)},
    off(name,fn){if(events.get(name)===fn)events.delete(name)},
    fire(name){events.get(name)?.()},
  };
}

test("all route segments render BELOW basemap names, not in a Leaflet overlay pane",()=>{
  const geo=routeGeometry([[
    {lat:35.17,lng:126.81},
    {lat:35.18,lng:126.82},
    {lat:35.19,lng:126.83},
  ]]);
  const original=JSON.stringify(geo);
  const collection=vectorCourseGeometry(geo);
  const colors=collection.features.filter(f=>f.properties.kind==="gradient");
  assert.ok(colors.length>=90,"gradient includes every step");
  assert.deepEqual(colors[0].geometry.coordinates[0],[126.81,35.17],"MapLibre uses longitude,latitude");
  const gl=fakeGL();
  const overlay=mountVectorCourse(gl,collection);
  const layerIds=gl.getStyle().layers.map(layer=>layer.id);
  for(const id of ["rs-course-rail","rs-course-casing","rs-course-gradient"]){
    assert.ok(layerIds.indexOf(id)<layerIds.indexOf("major-place-names"),id+" stays behind all text");
    assert.ok(layerIds.indexOf(id)>layerIds.indexOf("roads"),id+" stays above road colors");
  }
  assert.equal(gl.getSource("rs-course-route-source").data.features.length,collection.features.length);
  assert.equal(JSON.stringify(geo),original,"never modifies GPS samples");
  overlay.destroy();
  assert.equal(gl.getLayer("rs-course-gradient"),undefined);
  assert.equal(gl.getSource("rs-course-route-source"),undefined);
});

test("vector route is restored if MapLibre reloads its style while the timeline stays open",()=>{
  const gl=fakeGL(),overlay=mountVectorCourse(gl,{type:"FeatureCollection",features:[]});
  const before=gl.history.filter(row=>row[0]==="layer").length;
  gl.fire("style.load");
  assert.equal(gl.history.filter(row=>row[0]==="layer").length,before,"style callbacks cannot duplicate route layers");
  overlay.destroy();
  gl.fire("style.load");
  assert.equal(gl.getLayer("rs-course-gradient"),undefined,"teardown unregisters lifecycle callbacks");
});

test("playback reveals recorded colored GPS edges without inventing gaps",()=>{
  const parts=[{
    times:[1000,3000,5000],
    lngLat:[[126.81,35.17],[126.82,35.18],[126.83,35.19]],
    color:"rgb(246,151,69)",
  },{
    times:[9000,11000],
    lngLat:[[126.9,35.3],[126.91,35.31]],
    color:"rgb(3,66,50)",
  }];
  assert.equal(vectorPlaybackGeometry(parts,999).features.length,0);
  const mid=vectorPlaybackGeometry(parts,2000).features;
  assert.equal(mid.length,1);
  assert.deepEqual(mid[0].geometry.coordinates.at(-1),[126.815,35.175]);
  const between=vectorPlaybackGeometry(parts,7000).features;
  assert.equal(between.length,1,"no fake line between separate trips");
  const final=vectorPlaybackGeometry(parts,11000).features;
  assert.equal(final.length,2);
  assert.deepEqual(final[1].geometry.coordinates[0],[126.9,35.3]);
});
