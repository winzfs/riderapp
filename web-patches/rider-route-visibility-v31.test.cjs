const assert = require("node:assert/strict");
const test = require("node:test");
const { patchNativeRouteStyleLoad } = require("./rider-route-visibility-v31.cjs");

test("renders route when style exists but tiles have not finished loading", () => {
  const old = `function routeOverlay(map){
    let current={},disposed=false;
    function install(){
      if(disposed||!map.isStyleLoaded())return;
      if(!map.getSource("course"))map.addSource("course",{type:"geojson",data:current});
    }
    map.on("style.load",install);
    return{
      set(data){current=data||EMPTY;if(map.isStyleLoaded())try{install()}catch(err){console.warn("course draw",err)}},
      remove(){disposed=true;map.off("style.load",install);}
    };
  }`;
  const patched = patchNativeRouteStyleLoad(old);
  assert.match(patched, /!map\.getStyle\?\.\(\)\?\.layers/);
  assert.match(patched, /map\.on\("load",safeInstall\)/);
  assert.doesNotMatch(patched, /!map\.isStyleLoaded\(\)/);
  assert.equal(patchNativeRouteStyleLoad(patched), patched);
  assert.throws(() => patchNativeRouteStyleLoad("unrelated"), /source changed/);
});
