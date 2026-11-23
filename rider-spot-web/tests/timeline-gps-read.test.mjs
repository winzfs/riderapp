import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { performance } from "node:perf_hooks";
import { rs33DateAdd } from "../src/timeline-dates.mjs";
import { nativeGpsDayRanges } from "../src/native-trip.mjs";
import {
  calendarDaysForTrip, loadCalendarGps, loadDetailGps, toNativeGpsSummary,
} from "../src/timeline-gps-read.mjs";
import { buildDailyTimeline } from "../src/daily-timeline.mjs";
import { timelineStartPoint, timelineEndPoint } from "../src/timeline-location.mjs";
import { buildRecapSnapshot } from "../src/ride-recap.mjs";

const ms = value => Date.parse(value);
const point = (seq, t) => ({ seq, t, lat: 35.15 + seq * 0.000001,
  lng: 126.83 + seq * 0.000001, accuracy: 5 });

test("1/6/12 months: selecting a date reads only its GPS, never the historical backlog", async () => {
  for (const days of [30, 180, 365]) {
    const history = Array.from({length:days}, (_, i) => {
      const day = rs33DateAdd("2025-10-01", i);
      return {
        id: "trip-" + i, started_at: day + "T10:00:00+09:00",
        ended_at: day + "T11:00:00+09:00", distance_km: 24,
        points: [], gps_native: true, gps_point_count: 5000,
        gps_day_ranges: {[day]:{firstSeq:1,lastSeq:5000,pointCount:5000}},
        gps_day_summary: {[day]:{distance_km:24, duration_ms:3600000,point_count:5000}},
      };
    });
    const day = rs33DateAdd("2025-10-01", days - 1);
    const reads = [];
    const reader = {
      async allPointsForDay(id, requestedDay, range) {
        reads.push({id,requestedDay,range});
        const at = ms(day + "T10:00:00+09:00");
        return {points:Array.from({length:5000}, (_, i) => point(i+1,at+i*600)),
          readCount:5000,indexed:true};
      },
    };
    const cache = new Map();
    const t0 = performance.now();
    const result = await loadCalendarGps(history,day,{reader,cache,owner:"test"});
    const elapsedMs = Math.round((performance.now()-t0)*100)/100;
    assert.equal(result.report.matchingTrips,1);
    assert.equal(result.report.sqliteTrips,1);
    assert.equal(result.report.sqlitePoints,5000);
    assert.equal(result.report.renderedPoints,5000);
    assert.equal(reads.length,1,"unselected trips must never call the native bridge");
    assert.deepEqual(reads[0].range,history.at(-1).gps_day_ranges[day]);
    assert.equal(buildDailyTimeline(result.records,day).route.points.length,5000);
    const again = await loadCalendarGps(history,day,{reader,cache,owner:"test"});
    assert.equal(again.report.sqlitePoints,0);
    assert.equal(again.report.cacheHits,1);
    assert.equal(reads.length,1);
    console.log(JSON.stringify({fixtureDays:days,historyTrips:history.length,
      selectedDay:day,gpsRead:result.report.sqlitePoints,routePoints:5000,
      jsMockElapsedMs:elapsedMs}));
  }
});

test("23:50–00:20: every midnight day keeps its route, markers, stop events, and export geometry", async () => {
  const started = ms("2026-11-18T23:50:00+09:00");
  const ended = ms("2026-11-19T00:20:00+09:00");
  const points = Array.from({length:180},(_,i) => point(i+1,started+i*10000));
  const source = {
    id:"night-ride",started_at:new Date(started).toISOString(),
    ended_at:new Date(ended).toISOString(),distance_km:5,
    points,
    events:[
      {type:"정차",at:"2026-11-18T23:55:00+09:00"},
      {type:"정차",at:"2026-11-19T00:06:00+09:00"},
    ],
  };
  source.gps_day_ranges = nativeGpsDayRanges(points);
  assert.deepEqual(calendarDaysForTrip(source),["2026-11-18","2026-11-19"]);
  assert.equal(source.gps_day_ranges["2026-11-18"].pointCount,60);
  assert.equal(source.gps_day_ranges["2026-11-19"].pointCount,120);
  const saved = toNativeGpsSummary(source);
  assert.equal(saved.points.length,0,"WebView persists metadata, not a GPS copy");
  assert.equal(saved.gps_point_count,180);
  assert.equal(source.points.length,180,"SQLite original unchanged");
  for (const [day,count,firstSeq,stopHour] of [
    ["2026-11-18",60,1,"23:55"],["2026-11-19",120,61,"00:06"],
  ]) {
    const actualCalls=[];
    const reader = {
      async allPointsForDay(id,requestedDay,range) {
        actualCalls.push({id,requestedDay,range});
        const matches = points.filter(p=>p.seq>=range.firstSeq && p.seq<=range.lastSeq);
        return {points:matches,readCount:matches.length,indexed:true};
      },
    };
    const {records,report} = await loadCalendarGps([saved],day,{reader});
    assert.equal(report.sqlitePoints,count);
    assert.equal(report.renderedPoints,count);
    assert.equal(actualCalls[0].range.firstSeq,firstSeq);
    const daily=buildDailyTimeline(records,day);
    assert.equal(daily.route.points.length,count);
    assert.equal(daily.route.events.length,1);
    assert.ok(daily.route.events[0].at.includes(stopHour));
    assert.equal(timelineStartPoint(daily.route).t,started+(firstSeq-1)*10000);
    assert.equal(timelineEndPoint(daily.route).t,started+(firstSeq+count-2)*10000);
    assert.ok(daily.route.points[0].break);
    const exported=buildRecapSnapshot(records,day);
    assert.ok(exported.segments.length>0,"image export has a GPS route");
    assert.equal(exported.segments.flat().length,count);
  }
  assert.deepEqual(toNativeGpsSummary({...source,gps_day_ranges:{}}).points,points,
    "without verified SQLite sequence coverage never delete original coordinates");
});

test("legacy local tracks remain readable; detail restores full original ride without changing day cache", async () => {
  const t=ms("2026-11-19T12:00:00+09:00");
  const legacy={id:"legacy",started_at:new Date(t).toISOString(),
    ended_at:new Date(t+60000).toISOString(),points:[point(1,t),point(2,t+10000)],events:[],distance_km:0.1};
  const modern={...legacy,id:"modern",points:[],gps_native:true,
    gps_point_count:3};
  let readCalls=0;
  const reader={async allPointsForDay(){readCalls++;return {points:[point(1,t),point(2,t+10000),point(3,t+20000)],readCount:3}},
    async allPoints(){readCalls++;return [point(1,t),point(2,t+10000),point(3,t+20000)]}};
  const {records}=await loadCalendarGps([legacy,modern],"2026-11-19",{reader});
  assert.equal(readCalls,1);
  assert.equal(records.length,2);
  assert.deepEqual(records[0].points,legacy.points);
  assert.equal(records[1].points.length,3);
  const detail=await loadDetailGps(modern,{reader});
  assert.equal(detail.points.length,3);
  assert.equal(readCalls,2);
});

test("existing WebView bridge pages only the selected SQLite sequence range", async () => {
  const start=ms("2026-11-18T23:50:00+09:00");
  const points=Array.from({length:180},(_,i)=>point(i+1,start+i*10000));
  const requests=[];
  const host={onmessage:null,postMessage(serialized){
    const message=JSON.parse(serialized);
    if(message.action!=="points")throw Error("unexpected action: "+message.action);
    requests.push(message);
    const batch=points.filter(p=>p.seq>message.afterSeq).slice(0,message.limit);
    host.onmessage({data:JSON.stringify({id:message.id,ok:true,data:{points:batch}})});
  }};
  const window={RiderSpotHost:host,__rsNativeInstalled:true,addEventListener(){}};
  const document={addEventListener(){},querySelector(){return null},visibilityState:"visible"};
  const context=createContext({window,document,console,clearTimeout,
    setTimeout(fn,ms){return ms===1000?0:setTimeout(fn,ms)},
    setInterval(){return 0}});
  runInContext(readFileSync(new URL("../src/native-gps.js",import.meta.url),"utf8"),context);
  const ranges=nativeGpsDayRanges(points);
  const result=await window.__rsGPS42NativeRead.allPointsForDay(
    "night-ride","2026-11-19",ranges["2026-11-19"]);
  assert.equal(result.indexed,true);
  assert.equal(result.points.length,120);
  assert.equal(result.readCount,120);
  assert.equal(requests.length,1);
  assert.equal(requests[0].afterSeq,60,"SQLite must seek past the prior date");
  assert.equal(requests[0].limit,120);
  assert.equal(result.points[0].seq,61);
});
