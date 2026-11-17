import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlaybackTrack, playbackFrame, playbackTimestamp,
  createPlaybackLayer, buildPlaybackColorSlices,
} from "../src/route-playback.mjs";
import { rs33CourseToneColor } from "../src/course-layers.mjs";

const begin = Date.parse("2026-11-16T08:00:00Z");
function run(id, offset, duration, points) {
  return {
    id, started_at: new Date(begin + offset).toISOString(),
    ended_at: new Date(begin + offset + duration).toISOString(),
    points: points.map(([lat,lng,t,br]) => ({
      lat, lng, t: begin + offset + t,
      accuracy: 6, ...(br ? { break: true } : {}),
    })),
  };
}

test("playback follows actual GPS seconds, interpolates between samples and honors route gaps", () => {
  const first = run("a", 0, 40000, [
    [35.1,126.8,0],[35.1002,126.8002,10000],
    [35.1004,126.8004,20000],[35.102,126.803,39000,true],
  ]);
  const second = run("b", 3600000, 20000, [
    [35.2,126.9,0],[35.2002,126.9002,20000],
  ]);
  const snapshot = JSON.stringify([first,second]);
  const track = buildPlaybackTrack([second,first]);
  assert.equal(track.duration, 60000, "idle hour between saved trips is skipped");
  assert.equal(track.samples, 6);
  assert.equal(track.segments.length, 3, "GPS break and ride boundary remain distinct");
  assert.equal(playbackTimestamp(track, 50000), begin + 3610000);
  assert.deepEqual(playbackFrame(track, -5).lines[0], [[35.1,126.8]]);
  const halfway = playbackFrame(track, 5000);
  assert.equal(halfway.lines[0].length, 2);
  assert.ok(Math.abs(halfway.point[0] - 35.1001) < 1e-7);
  assert.equal(playbackFrame(track, 30000).lines[1].length, 0);
  const between = playbackFrame(track, 40000);
  assert.equal(between.lines[0].length, 3);
  assert.equal(between.lines[1].length, 1);
  assert.deepEqual(between.lines[2], [[35.2,126.9]]);
  assert.deepEqual(playbackFrame(track, 60000).point, [35.2002,126.9002]);
  assert.equal(JSON.stringify([first,second]), snapshot, "GPS originals remain untouched");
});

test("no timestamps or no valid locations means no fabricated playback", () => {
  const sample = run("a", 0, 60000, []);
  assert.equal(buildPlaybackTrack([sample]), null);
  sample.points = [{lat:35.1,lng:126.8},{lat:35.2,lng:126.9}];
  assert.equal(buildPlaybackTrack(sample), null);
  assert.equal(buildPlaybackTrack(null), null);
});

test("15,000 GPS samples prepare without mutating source data", () => {
  const points = Array.from({length:15000},(_,i)=>[
    35.1 + i * 0.000002,126.8 + i * 0.000002,i * 1000,
  ]);
  const source=run("large",0,15000000,points);
  const track=buildPlaybackTrack(source);
  assert.equal(track.samples,15000);
  assert.equal(track.segments.length,1);
  assert.equal(playbackFrame(track,7500500).lines[0].length,7502);
  assert.equal(source.points[100].break,undefined);
});

test("Leaflet playback renderer updates and cleans its layers with no raw-record changes", () => {
  const track=buildPlaybackTrack(run("a",0,10000,[
    [35.1,126.8,0],[35.1002,126.8002,10000],
  ]));
  const layers=[];
  const group={
    remove(){layers.push("destroy");},
    removeLayer(){layers.push("removeMarker");},
    addTo(){return this;},
  };
  const L={
    layerGroup(){return group;},
    polyline(){
      return {
        addTo(){return this;},
        setLatLngs(coords){layers.push(coords.map(x=>x.slice()));},
      };
    },
    circleMarker(){
      return {
        setLatLng(c){layers.push(["marker",...c]);},
        addTo(){layers.push("markerAdded");return this;},
      };
    },
  };
  const playback=createPlaybackLayer(L,{},track);
  playback.setTime(0);
  playback.setTime(5000);
  playback.destroy();
  assert.deepEqual(layers[0],[[35.1,126.8]]);
  assert.ok(layers.some(entry => Array.isArray(entry) && entry.length === 2 && Array.isArray(entry[0])));
  assert.equal(layers.at(-1),"destroy");
});


test("100x replay is selectable without changing GPS time interpolation", async () => {
  const { useRoutePlayback } = await import("../src/route-playback.mjs");
  const source = run("speed", 0, 100000, [
    [35.1, 126.8, 0], [35.101, 126.801, 50000], [35.102, 126.802, 100000],
  ]);
  const original = JSON.stringify(source);
  let state;
  const React = {
    useMemo(factory) { return factory(); },
    useState(initial) {
      if (state === undefined) state = initial;
      return [state, (change) => {
        state = typeof change === "function" ? change(state) : change;
      }];
    },
    useEffect() {},
  };
  const controller = useRoutePlayback(React, source);
  assert.equal(controller.speed, 20, "existing speed default remains 20x");
  controller.setSpeed(100);
  assert.equal(useRoutePlayback(React, source).speed, 100);
  const track = buildPlaybackTrack(source);
  assert.equal(playbackTimestamp(track, 50000), begin + 50000);
  assert.deepEqual(playbackFrame(track, 50000).point, [35.101, 126.801]);
  assert.equal(JSON.stringify(source), original, "100x option never alters GPS points");
  useRoutePlayback(React, source).setSpeed(999);
  assert.equal(useRoutePlayback(React, source).speed, 100, "invalid speeds are rejected");
});


test("playback keeps the completed-route gradient fixed while revealing real-time GPS positions", () => {
  const first = run("a", 0, 40000, [
    [35.1,126.8,0],
    [35.101,126.801,10000],
    [35.102,126.802,20000],
    [35.103,126.803,39000,true],
  ]);
  const second = run("b", 3600000, 30000, [
    [35.2,126.9,0],[35.201,126.901,15000],[35.202,126.902,30000],
  ]);
  const original = JSON.stringify([first, second]);
  const track = buildPlaybackTrack([first, second]);
  const slices = buildPlaybackColorSlices(track);
  assert.ok(slices.length >= 24, "the full track spans 24 gradient tones");
  assert.equal(slices[0].tone, 0);
  assert.equal(slices.at(-1).tone, 23);
  assert.equal(rs33CourseToneColor(0), "rgb(180,235,215)");
  assert.equal(rs33CourseToneColor(23), "rgb(3,66,50)");
  assert.ok(slices.every((part) =>
    part.coordinates.length === part.times.length && part.coordinates.length >= 2 &&
    part.times.every((time) => Number.isFinite(time)) &&
    part.segmentIndex >= 0 && part.segmentIndex < track.segments.length
  ), "each slice stays within one original GPS segment");
  const created = [];
  const group = { addTo() { return this; }, remove() {}, removeLayer() {} };
  const L = {
    layerGroup() { return group; },
    polyline(coords, style) {
      const layer = { color: style.color, coords, addTo() { return this; },
        setLatLngs(value) { this.coords = value.map((point) => [...point]); } };
      created.push(layer);
      return layer;
    },
    circleMarker() {
      return { setLatLng() {}, addTo() { return this; } };
    },
  };
  const playback = createPlaybackLayer(L, {}, track);
  const palette = created.map((part) => part.color);
  assert.equal(palette[0], "rgb(180,235,215)");
  assert.equal(palette.at(-1), "rgb(3,66,50)");
  playback.setTime(20000);
  assert.ok(created.some((part) => part.coords.length >= 2 && part.color !== palette.at(-1)),
    "earlier route is visible with its original color");
  assert.equal(created.at(-1).coords.length, 0, "unvisited final route is not visible");
  playback.setTime(track.duration);
  assert.ok(created.every((part) => part.coords.length >= 2), "whole route appears after playback finishes");
  playback.setTime(5000);
  assert.equal(created.at(-1).coords.length, 0, "seeking backward hides future route");
  assert.deepEqual(created.map((part) => part.color), palette, "colors do not shift during playback or seeking");
  assert.equal(JSON.stringify([first, second]), original, "GPS and gaps remain untouched");
  playback.destroy();
});

test("single stationary fix does not fabricate a colored route", () => {
  const track = buildPlaybackTrack(run("stationary", 0, 20000, [
    [35.1, 126.8, 0], [35.1, 126.8, 20000],
  ]));
  assert.deepEqual(buildPlaybackColorSlices(track), []);
});
