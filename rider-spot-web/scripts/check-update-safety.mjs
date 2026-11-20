// Build/release-only safety gate. This file is never loaded by the Rider Spot app.
// It intentionally checks the *compiled* web release and the *archived* APK
// source; an old audited copy or a passing source-only test is not sufficient.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const projectRoot = resolve(webRoot, "..");
const androidRoot = process.env.RIDER_ANDROID_SOURCE;
assert.ok(androidRoot, "RIDER_ANDROID_SOURCE must point to an extracted source.tar.xz");

const read = path => readFileSync(path, "utf8");
const web = path => read(join(webRoot, path));
const android = path => read(join(androidRoot, path));
const check = (label, action) => {
  action();
  console.log("PASS: " + label);
};
const section = (text, start, end) => {
  const at = text.indexOf(start);
  assert.ok(at !== -1, "Missing required section: " + start);
  const to = text.indexOf(end, at + start.length);
  assert.ok(to > at, "Missing section boundary: " + end);
  return text.slice(at, to);
};

const bridge = android("app/src/main/assets/native-bridge.js");
const manifest = android("app/src/main/AndroidManifest.xml");
const activity = android("app/src/main/java/com/riderspot/android/MainActivity.java");
const nativeGps = web("src/native-gps.js");
const camera = web("src/map-controller.mjs");
const html = web("dist/index.html");
const worker = web("dist/sw.js");
const release = JSON.parse(web("dist/release.json"));
const assetRoot = "/assets/rider-spot-" + release.hash + "/";

check("Archived Android bridge has no self-induced page reload", () => {
  assert.doesNotMatch(bridge, /(?:location|window\.location)\s*\.\s*(?:reload|replace|assign)\s*\(/);
  assert.doesNotMatch(bridge, /(?:window|document)\.location\.href\s*=/);
});
check("Finished native trip cannot be resurrected by 3-second reconciliation", () => {
  const completed = section(bridge, "function isTripCompleted(", "function readActiveTrip(");
  const missing = section(bridge, "async function recoverMissingTrip(", "async function recoverStoppedTrip(");
  const stopped = section(bridge, "async function recoverStoppedTrip(", "function restoreInPage(");
  assert.match(completed, /rs:trips:/);
  assert.match(completed, /native-merged/);
  assert.match(completed, /row\?\.id\s*===\s*id\s*&&\s*row\.ended_at/);
  assert.match(missing, /if\s*\(\s*isTripCompleted\(userId,\s*id\)\s*\)\s*return/);
  assert.match(stopped, /if\s*\(\s*isTripCompleted\(userId,\s*id\)\s*\)/);
  assert.match(stopped, /if\s*\(!record\)\s*return/);
  assert.match(bridge, /const finalizingTripIds = new Set\(\)/);
  assert.match(bridge, /for \(const key of \['rs:active:' \+ userId,\s*'active:' \+ userId\]\)/);
});
check("Native and web GPS never auto-start already completed/old rides", () => {
  assert.match(nativeGps, /function mayRetryFreshNativeStart\(trip,\s*status\)/);
  const protection = section(nativeGps, "function mayRetryFreshNativeStart(", "async function poll(");
  assert.match(protection, /trip\.ended_at/);
  assert.match(protection, /status\?\.lastStoppedId\s*===\s*trip\.id/);
  assert.match(protection, /60_000/);
  assert.match(nativeGps, /mayRetryFreshNativeStart\(api\.trip,\s*status\)/);
  assert.doesNotMatch(nativeGps, /\blocation\.reload\s*\(/);
});
check("Android display and split-screen do not recreate WebView from onResume", () => {
  const match = manifest.match(/android:configChanges="([^"]+)"/);
  assert.ok(match, "Android configuration guard missing");
  const flags = new Set(match[1].split("|"));
  for (const flag of ["orientation","screenSize","smallestScreenSize","screenLayout",
    "keyboardHidden","keyboard","uiMode","density","fontScale","layoutDirection"]) {
    assert.ok(flags.has(flag), "Missing Android configuration flag: " + flag);
  }
  const onResume = section(activity, "@Override protected void onResume()", "@Override protected void onPause()");
  assert.doesNotMatch(onResume, /webView\.(?:loadUrl|reload)\s*\(/);
});
check("Map retains manually selected camera across GPS and resize events", () => {
  assert.match(camera, /rs:map-main-camera-v52/);
  assert.match(camera, /sessionStorage/);
  assert.match(camera, /localStorage/);
  const initial = section(camera, "initialLocation(position)", "destroy()");
  // The startup-only flag allows one GPS focus per new document while preserving the\n  // user camera on later GPS fixes and tab remounts (verified by map-startup-camera tests).\n  assert.match(initial, /!window\\.__rsStartupMainCameraSet/);
  assert.match(initial, /!userInteracted/);
  const resize = section(camera, "function resize()", "function scheduleResize()");
  assert.match(resize, /map\.invalidateSize/);
  assert.doesNotMatch(resize, /map\.setView\s*\(/);
});
check("Compiled web release references current GPS/map code, not legacy bridge", () => {
  assert.match(release.hash, /^[0-9a-f]{12}$/);
  assert.match(html, /id="root"/);
  const needed = ["app.mjs","native-gps.js","tab-resume.js","weather-bar.js",
    "design-system.css","daily-timeline.css","weather-bar.css","premium-shell.css"];
  for (const asset of needed) {
    const url = assetRoot + asset;
    assert.ok(release.files.includes(url), "Unlisted release asset: " + asset);
    assert.ok(html.includes(url), "HTML missing release asset: " + asset);
    assert.ok(worker.includes(url), "Service worker missing release asset: " + asset);
    assert.ok(web("dist" + url).length > 100, "Missing/empty asset: " + asset);
  }
  assert.doesNotMatch(html, /src="\/rider-gps-recovery-v42\.js/);
  assert.doesNotMatch(html, /src="\/rider-tab-resume-v54\.js/);
});
check("PWA updates cannot force-restart a delivery session", () => {
  assert.doesNotMatch(worker, /\b(?:skipWaiting|clients\.claim)\s*\(/);
  assert.match(worker, /async function navigate\(request\)/);
  assert.doesNotMatch(worker, /location\.reload\s*\(/);
});
check("Production Worker stays modular with v220 fallback and native OAuth callback", () => {
  const config=JSON.parse(web("wrangler.kv-front-production.json"));
  assert.equal(config.name,"rider-spot");
  assert.equal(config.main,"edge/static-edge.mjs");
  assert.deepEqual(config.services,[
    {binding:"ASSETS",service:"rider-spot-static-candidate-assets"},
    {binding:"LEGACY",service:"rider-spot-api-core-qa"}
  ]);
  assert.ok(config.services.every(binding=>binding.service!==config.name));
  assert.equal(config.assets,undefined);
  const front=web("edge/static-edge.mjs");
  const api=web("edge/api-core.mjs");
  assert.ok(front.length<12000,"Front Worker became monolithic");
  assert.ok(api.length<35000,"API core became monolithic");
  assert.match(front,/ANDROID_OAUTH_COOKIE/);
  assert.match(front,/rs-recovery-guard-v217/);
  assert.match(front,/x-rs-fallback/);
  assert.match(front,/const original = \(\) =>/);
  assert.match(api,/LEGACY_BACKEND/);
  assert.doesNotMatch(front,/const rsNewAssets\s*=/);
  assert.doesNotMatch(api,/const rsNewAssets\s*=/);
});
console.log("RIDER_SPOT_UPDATE_SAFETY_GATE=PASS (" + release.hash + ")");
