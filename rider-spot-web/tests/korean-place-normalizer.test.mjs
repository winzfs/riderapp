import test from "node:test";
import assert from "node:assert/strict";
import { normalizeKoreanPlaces } from "../src/korean-place-normalizer.mjs";
test("SEMAS coordinates and business names are normalized and deduplicated", () => {
 const row={bizesId:"A",bizesNm:"광주 식당",lon:"126.82",lat:"35.17",indsSclsNm:"한식"};
 const result=normalizeKoreanPlaces([row,row,{bizesNm:"invalid",lon:"1",lat:"2"}]);
 assert.equal(result.features.length,1);
 assert.deepEqual(result.features[0].geometry.coordinates,[126.82,35.17]);
 assert.equal(result.features[0].properties.name,"광주 식당");
});
test("official building records are accepted only with valid geographic coordinates",()=>{
 const r=normalizeKoreanPlaces([{bldNm:"수완 아파트",경도:126.83,위도:35.18}],"apartment");
 assert.equal(r.features[0].properties.category,"apartment");
});
