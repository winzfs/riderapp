# Rider Spot web stability release

This directory builds the Rider Spot application on `feature/rider-spot-native-apk`. The unrelated Android project at the repository root is outside this build.

The deployed v52 bundle (`/assets/index-rider-v35-cb5dc21ec4b4.js?ui=v52-stable-raster-camera`, SHA-256 `5a1cd9e1dbc0f5fefb89fdb61e1dae275e2fc629a517a6cba89cd356d6cfe21d`) was the only matching web source available. The React/Supabase/Leaflet compatibility runtime and unaffected screens were extracted once into `legacy/compatibility.mjs.gz`. The build imports the modules in `src/` and bundles them normally. It never fetches or rewrites a production JavaScript bundle. The v52 HTML and Service Worker are retained as templates so existing screens and legacy URLs stay available.

## Design

- `map-controller.mjs` owns map creation, removal, camera persistence, and resizing. GPS may initialize a new viewport once. Panning, zooming, and loading a saved camera take control away from GPS. Main and per-trip cameras are independent. Explicit location and route-fit actions remain available.
- `RiderMap.mjs`, `basemap.mjs`, and `map-reports.js` manage markers, raster/vector rendering, local labels, and facility selection. A facility selection is consumed once. Vector context failure restores raster tiles using the Leaflet viewport.
- `Timeline.mjs` mounts the map and history before `route-worker.mjs` returns the formatted course. The analysis preserves the GPS record, and the renderer batches the gradient and revisit rail layers. A limited number of time labels and direction markers may be visible at once. The event list retains individual stops.
- `native-gps.js`, `native-trip.mjs`, `trip-storage.mjs`, and `use-ride.mjs` preserve the Android SQLite capture. Finish confirms the native stop, reads paged fixes, commits local history, and then uploads the completed record through a single retry queue. Existing account-scoped legacy history is read for recovery. Existing Android v1.0.6 uses this path through its published JavaScript bridge. Native app installation, signing and the SQLite schema are unchanged.

## Build and verify

```sh
npm ci
npm run build
npm test
npx playwright install chromium
RIDER_BASELINE_DIR=/path/to/captured-v52-public-assets \
RIDER_APK_BRIDGE=/path/to/native-bridge.js npm run test:browser
```

`RIDER_BASELINE_DIR` supplies unchanged assets and a v52 comparison target. Use the existing APK source archive for the bridge and `--baseline` or `--benchmark` for comparison. `RIDER_TEST_URL` runs the browser suite against a deployed candidate. Browser tests stub route matching, tiles, Supabase and the native message host. They should be supplemented with actual sign-in and locked-screen GPS on Android, a real route match and tile provider checks before promoting a release that changes those entry points.

## Deploy or roll back

The previous Worker deployment is `8ddc2a4d-b532-49a3-9122-a919918bd7b1`, version `52f80ea5-6286-4419-8b0d-ac289a2fafb4`. The normalized v52 `worker.mjs` snapshot from Cloudflare has SHA-256 `3b5a2e66247117e39c59f6200d4d0d2e02404fc070d73425caf6c3f84b145fc9`.

```sh
node scripts/overlay-worker.mjs /path/to/worker-v52.mjs dist /tmp/rider-spot-candidate.mjs \
  3b5a2e66247117e39c59f6200d4d0d2e02404fc070d73425caf6c3f84b145fc9
```

Upload a Worker version while leaving active traffic on the previous version. Test the version URL before directing traffic to it. Deploy the verified version with the existing compatibility date, flags, and bindings. If needed, roll back in Workers & Pages → `rider-spot` → Deployments using the previous version ID. A rollback requires no local data cleanup. Clients using v52's Service Worker can go online and reopen the app to pick up the manifest.
