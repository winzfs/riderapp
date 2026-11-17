import test from "node:test";
import assert from "node:assert/strict";
import { rs33Stamps, rs33InferredStops } from "../src/route-analysis.mjs";

const at = (sec, lat=35.15, lng=126.83) => ({lat, lng, time: Date.parse("2026-11-17T00:00:00Z")+sec*1000});
test("sustained stationary samples become clearly inferred stops", () => {
  const groups = [[at(0,35.14),at(15,35.145),at(30),at(60,35.15001),at(105,35.15001),at(135,35.15002),at(165,35.15001),at(190,35.16)]];
  const stops = rs33InferredStops(groups);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].kind,"stop");
  assert.equal(stops[0].inferred,true);
  assert.match(stops[0].label,/정차 추정/);
});
test("native stop survives and nearby inferred stop does not duplicate it", () => {
  const points = [[at(0,35.14),at(15,35.145),at(30),at(60),at(90),at(125),at(155),at(190,35.16)]];
  const events = [{at:new Date(at(35).time).toISOString(),lat:35.15,lng:126.83,type:"정차",source:"riderspot-native-stop-v1"}];
  const stops = rs33Stamps(points,events).filter(s=>s.kind==="stop");
  assert.equal(stops.length,1);
  assert.equal(stops[0].inferred,false);
});
test("manual break events only place on a nearby recorded GPS fix",()=>{
  const groups=[[at(0),at(15),at(30)]];
  const events=[{type:"휴식 시작",at:new Date(at(15).time).toISOString()},{type:"휴식 시작",at:new Date(at(9999).time).toISOString()}];
  const stops=rs33Stamps(groups,events).filter(s=>s.kind==="stop");
  assert.equal(stops.length,1);
  assert.equal(stops[0].time,at(15).time);
});
test("normal motion is not misclassified as stationary",()=>{
  const groups=[[at(0,35.14),at(30,35.141),at(60,35.142),at(90,35.143),at(120,35.144)]];
  assert.equal(rs33InferredStops(groups).length,0);
});

test("KST departure and exact full-hour stamps, including midnight", async () => {
  const { rs33HourlyStamps } = await import("../src/route-analysis.mjs");
  const ts = (s) => Date.parse(s);
  const a = ts("2026-11-17T14:59:30Z"); // 23:59:30 KST
  const b = ts("2026-11-17T15:00:30Z"); // 00:00:30 KST
  const groups = [[{ lat: 35.1, lng: 126.8, time: a }, { lat: 35.2, lng: 126.9, time: b }]];
  const hours = rs33HourlyStamps(groups);
  assert.equal(hours.length, 1);
  assert.equal(hours[0].time, ts("2026-11-17T15:00:00Z"));
  assert.equal(new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle:"h23" }).format(hours[0].time), "00:00");
  assert.ok(Math.abs(hours[0].lat - 35.15) < 0.000001);
  const markers = rs33Stamps(groups, []);
  assert.equal(markers[0].label, "출발");
  assert.equal(markers.filter(x => x.kind === "hour").length, 1);
  assert.equal(markers.some(x => x.kind === "end"), false);
});
test("hour labels do not connect GPS outages or separate journeys", async () => {
  const { rs33HourlyStamps } = await import("../src/route-analysis.mjs");
  const ts=s => Date.parse(s);
  const groups = [
    [{lat:35.1,lng:126.8,time:ts("2026-11-17T14:58:00Z")},{lat:35.1,lng:126.8,time:ts("2026-11-17T15:02:00Z")}],
    [{lat:35.2,lng:126.9,time:ts("2026-11-17T16:58:00Z")}],
    [{lat:35.3,lng:126.9,time:ts("2026-11-17T17:02:00Z")}],
  ];
  assert.deepEqual(rs33HourlyStamps(groups),[]);
});
