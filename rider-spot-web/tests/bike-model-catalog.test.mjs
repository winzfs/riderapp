import test from "node:test";
import assert from "node:assert/strict";
import {bikeModels,bikeBrands,inferBikeModel,findBikeModel,modelParts,modelDefaults,
  resolveMaintenance,costLabel} from "../src/bike-model-catalog.mjs";
test("catalog covers 70+ unique delivery models from major brands",()=>{
  assert.ok(bikeModels.length>=70);
  assert.ok(bikeBrands.length>=8);
  assert.equal(new Set(bikeModels.map(m=>m.key)).size,bikeModels.length);
  assert.ok(bikeModels.every(m=>m.brandLabel && m.name && m.cc>0 && m.key.length<=64));
});
test("legacy PCX125 inference matches while unknown vehicle stays custom",()=>{
  assert.equal(inferBikeModel("PCX125")?.key,"honda-pcx125");
  assert.equal(inferBikeModel("혼다 PCX125")?.key,"honda-pcx125");
  assert.equal(inferBikeModel("NMAX 125")?.key,"yamaha-nmax125");
  assert.equal(inferBikeModel("나만의 바이크"),null);
});
test("manufacturer-proven service intervals and estimates remain visibly distinct",()=>{
  const pcx=findBikeModel("honda-pcx125"), nmax=findBikeModel("yamaha-nmax125");
  const oil=modelDefaults(pcx,"엔진오일"),belt=modelDefaults(pcx,"구동벨트");
  assert.equal(oil.interval_km,6000);
  assert.equal(oil.interval_days,365);
  assert.equal(oil.interval_source,"manual");
  assert.equal(belt.interval_km,24000);
  assert.equal(modelDefaults(nmax,"구동벨트").interval_km,18000);
  const tyre=modelDefaults(pcx,"뒤 타이어");
  assert.equal(tyre.interval_source,"estimate");
  assert.ok(tyre.estimated_cost_won>0);
  assert.match(costLabel({...tyre,source:"default"}),/원.*~.*원/);
});
test("model switching never carries an edit between models, can restore default",()=>{
  const pcx=findBikeModel("honda-pcx125"),nmax=findBikeModel("yamaha-nmax125");
  const userOverrides=[{model_key:pcx.key,item_key:"엔진오일",interval_km:2500,
    interval_days:120,estimated_cost_won:23000}];
  const legacy=[{item_key:"엔진오일",interval_km:3300,interval_days:null}];
  const own=resolveMaintenance(pcx,"엔진오일",userOverrides,legacy,true);
  assert.equal(own.interval_km,2500);
  assert.equal(own.estimated_cost_won,23000);
  assert.equal(own.source,"personal");
  assert.equal(resolveMaintenance(nmax,"엔진오일",userOverrides,legacy,true).interval_km,3000);
  assert.equal(resolveMaintenance(pcx,"엔진오일",[],legacy,true).interval_km,6000);
  assert.equal(resolveMaintenance(pcx,"엔진오일",[],legacy,false).interval_km,3300);
});
test("chain and EV modes cannot propose nonexistent scooter CVT belt and engine oil",()=>{
  const cub=findBikeModel("honda-supercub110"),ev=findBikeModel("niu-nqi-gts");
  assert.ok(modelParts(cub).includes("구동체인"));
  assert.ok(!modelParts(cub).includes("구동벨트"));
  assert.equal(modelDefaults(cub,"구동벨트"),null);
  assert.deepEqual(modelParts(ev),["앞 타이어","뒤 타이어","브레이크 패드","배터리"]);
  assert.equal(modelDefaults(ev,"엔진오일"),null);
  assert.equal(modelDefaults(ev,"배터리").interval_km,null);
});
