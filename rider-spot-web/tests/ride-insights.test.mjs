import test from "node:test";
import assert from "node:assert/strict";
import { completedRideRows, dailyRideSnapshot, riderRhythm, rideRecapText, rideEfficiency } from "../src/ride-insights.mjs";

const trip = (id,start,end,km=3) => ({id, started_at:start, ended_at:end, distance_km:km, points:[{lat:35.17,lng:126.83}],events:[]});
test("familiar routine uses completed distinct trips and never consumes coordinates", () => {
 const rides=[trip("a","2026-11-16T09:00:00Z","2026-11-16T10:00:00Z",12),trip("b","2026-11-17T02:00:00Z","2026-11-17T03:00:00Z",9),trip("b","2026-11-17T02:00:00Z","2026-11-17T03:00:00Z",9),trip("active","2026-11-17T01:00:00Z",null,55),trip("future","2026-11-29T01:00:00Z","2026-11-29T02:00:00Z",44)];
 const before=JSON.stringify(rides);
 const now=Date.parse("2026-11-17T14:00:00Z");
 assert.equal(completedRideRows(rides,now).length,2);
 const rhythm=riderRhythm(rides,now);
 assert.equal(rhythm.activeDays,2);
 assert.equal(rhythm.sessions,2);
 assert.equal(rhythm.favorite,"저녁 시간");
 assert.equal(rhythm.averageMinutes,60);
 assert.equal(dailyRideSnapshot(rides,"2026-11-17",now).distanceKm,9);
 assert.equal(JSON.stringify(rides),before);
});
test("a repeated local routine remains useful with no novelty pressure", () => {
 const rides=Array.from({length:5},(_,i)=>trip("s"+i,"2026-11-"+String(12+i).padStart(2,"0")+"T09:00:00Z","2026-11-"+String(12+i).padStart(2,"0")+"T10:00:00Z",5));
 const rhythm=riderRhythm(rides,Date.parse("2026-11-18T00:00:00Z"));
 assert.equal(rhythm.activeDays,5);
 assert.equal(rhythm.favorite,"저녁 시간");
});
test("day recap copies no coordinate, rider or delivery personal data", () => {
 const rows=[trip("privacy","2026-11-16T23:00:00Z","2026-11-16T23:30:00Z",2)];
 rows[0].memo="DO NOT COPY CUSTOMER";
 const text=rideRecapText(rows,"2026-11-17");
 assert.match(text,/라이딩/);
 assert.match(text,/2.0km/);
 assert.ok(!text.includes("35.17")&&!text.includes("126.83")&&!text.includes("CUSTOMER"));
 assert.equal(rideRecapText(rows,"2026-11-18"),"");
});
test("earnings efficiency is optional, explanatory, and zero-safe", () => {
 const snapshot={trips:1,durationMs:7200000,distanceKm:40};
 assert.deepEqual(rideEfficiency(40000,snapshot),{perHour:20000,perKm:1000});
 assert.equal(rideEfficiency(0,snapshot),null);
 assert.equal(rideEfficiency(1000,{trips:0,durationMs:0,distanceKm:0}),null);
});
