import assert from "node:assert/strict";
import test from "node:test";
import { preferPublicKoreanPlaceLabels, GWANGJU_PUBLIC_LABEL_AREA } from "../src/korean-label-dedup.mjs";

test("public Korean regions replace the same OSM dong names only in Gwangju", () => {
  const layers = [
    { id:"rs46-district-labels", type:"symbol", "source-layer":"place", filter:["match",["get","class"],["town"],true,false] },
    { id:"rs46-neighbourhood-labels", type:"symbol", "source-layer":"place", filter:["match",["get","class"],["quarter"],true,false] },
    { id:"base-cities", type:"symbol", "source-layer":"place", filter:["==",["get","class"],"city"] },
    { id:"rs46-major-road-labels", type:"symbol", "source-layer":"transportation_name" },
    { id:"rs-korean-business-names", type:"symbol", "source-layer":"poi", filter:["all",["has","name"]] },
    { id:"rs-public-region-label", type:"symbol", source:"rs-public-korean-names" },
  ];
  const gl={ getStyle:()=>({layers}), setFilter:(id,f)=>{layers.find(x=>x.id===id).filter=f} };
  assert.equal(preferPublicKoreanPlaceLabels(gl),4);
  assert.equal(preferPublicKoreanPlaceLabels(gl),0);
  const district=layers[0].filter;
  assert.equal(district[0],"all");
  assert.ok(JSON.stringify(district).includes('"within"'));
  assert.deepEqual(GWANGJU_PUBLIC_LABEL_AREA.coordinates[0][0],[126.68,34.98]);
  assert.deepEqual(layers[3].filter,undefined,"road names must be preserved");
  assert.equal(layers[5].filter,undefined,"official labels must remain visible");
  assert.equal(layers[2].filter[1][0],"==","city labels retain their original filter");
});
