import assert from "node:assert/strict";
import test from "node:test";
import { rsNormalizeWeather, rsHandleWeather } from "../src/weather-proxy.mjs";

const base = Date.now();
function forecast() {
  return { properties: {
    meta:{updated_at:new Date(base).toISOString()},
    timeseries:[0,1,2,3,4,5,6,7].map((h) => ({
      time:new Date(base + h*3600000).toISOString(),
      data:{
        instant:{details:{air_temperature:14+h,relative_humidity:65,wind_speed:3.2}},
        next_1_hours:{summary:{symbol_code:h===1?"lightrain":"cloudy"},details:{precipitation_amount:h===1?1.4:0}}
      }
    }))
  }};
}
test("compact weather includes current temperature, wind and next-hour precipitation", () => {
  const v = rsNormalizeWeather(forecast(),base);
  assert.equal(v.source,"MET Norway");
  assert.equal(v.hours[0].temp,14);
  assert.equal(v.hours[0].humidity,65);
  assert.equal(v.hours[0].wind,3.2);
  assert.equal(v.hours[1].symbol,"lightrain");
  assert.equal(v.hours[1].precipMm,1.4);
  assert.equal(v.hours.length,7);
});
test("invalid and stale weather never becomes a misleading 'now' value", () => {
  assert.throws(()=>rsNormalizeWeather({properties:{timeseries:[]}},base),/missing/);
  assert.throws(()=>rsNormalizeWeather({properties:{timeseries:[{time:new Date(base-7200000).toISOString(),data:{}}]}},base),/stale/);
});
test("weather endpoint blocks invalid coordinates and rounds exact rider location to shared grid", async () => {
  const orig = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url,options) => {
    captured = {url:String(url),headers:options.headers};
    return new Response(JSON.stringify(forecast()),{status:200,headers:{"Content-Type":"application/json"}});
  };
  try {
    const bad = await rsHandleWeather(new Request("https://rider-spot.example/api/weather?lat=99&lon=200"));
    assert.equal(bad.status,400);
    const valid = await rsHandleWeather(new Request("https://rider-spot.example/api/weather?lat=35.19123&lon=126.823"));
    assert.equal(valid.status,200);
    const data=await valid.json();
    assert.equal(data.hours[1].precipMm,1.4);
    assert.ok(captured.url.includes("lat=35.2"));
    assert.ok(captured.url.includes("lon=126.8"));
    assert.ok(captured.headers["User-Agent"].startsWith("RiderSpot/"));
  } finally {globalThis.fetch=orig;}
});
