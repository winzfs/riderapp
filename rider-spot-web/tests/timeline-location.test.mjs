import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isTimelineCoordinate, timelineStartPoint, timelineLivePosition,
  timelineFixStale, timelineHeading,
} from "../src/timeline-location.mjs";

test("start marker uses the first measured GPS fix, not map bounds or cleaned geometry", () => {
  const record = { points: [
    { lat: null, lng: null, t: 100 },
    { lat: 35.14, lng: 126.80, t: 1000, break: true },
    { lat: 35.17, lng: 126.83, t: 2000 },
  ]};
  const snapshot = JSON.stringify(record);
  assert.deepEqual(timelineStartPoint(record), record.points[1]);
  assert.deepEqual(timelineStartPoint(record.points), record.points[1]);
  assert.equal(JSON.stringify(record), snapshot);
  assert.equal(timelineStartPoint({points: []}), null);
  assert.equal(timelineStartPoint(null), null);
  assert.equal(isTimelineCoordinate({lat: 100, lng: 127}), false);
});

test("active ride GPS marker favors latest native fix, without touching samples", () => {
  const trip = {points: [
    {lat: 35.1,lng:126.8,t:1000},
    {lat: 35.2,lng:126.9,t:3000,heading:94},
  ]};
  const original=JSON.stringify(trip);
  assert.equal(timelineLivePosition({lat:35.19,lng:126.88,t:2000},trip),trip.points[1]);
  const foreground={lat:35.21,lng:126.91,t:4000,accuracy:10,heading:35};
  assert.equal(timelineLivePosition(foreground,trip),foreground);
  assert.equal(timelineLivePosition(null,trip),trip.points[1]);
  assert.equal(timelineLivePosition({lat:NaN,lng:127},trip),trip.points[1]);
  assert.equal(JSON.stringify(trip),original);
});

test("stale GPS is visually distinguished and heading is optional", () => {
  const now=1763370000000;
  assert.equal(timelineFixStale({lat:35.1,lng:126.8,t:now-6000},now),false);
  assert.equal(timelineFixStale({lat:35.1,lng:126.8,t:now-50000},now),true);
  assert.equal(timelineFixStale({lat:35.1,lng:126.8,t:now+60000},now),true);
  assert.equal(timelineFixStale(null,now),true);
  assert.equal(timelineHeading({heading:0}),0);
  assert.equal(timelineHeading({heading:315}),315);
  assert.equal(timelineHeading({heading:-1}),null);
  assert.equal(timelineHeading({heading:null}),null);
});
