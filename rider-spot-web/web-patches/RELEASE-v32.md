# Rider Spot v32 · Start/finish markers and recap export

Production Cloudflare asset Worker: `rider-spot-map-v25-assets`
Active immutable asset hash: `b18d7e24c9a5`
KV prefix: `rs-endpoint-v32::`
Previous stable hash: `f31a8c70e942` retained as fallback/rollback.

## Preserved functionality
- Existing GPS coordinates, journey duration/distance, earnings, native SQLite, and Supabase records are **read-only** to these changes.
- Original timeline colored route style and recap image **blue route** were not changed.
- v31 route display retry on MapLibre `style.load` and `load` remains in the native script.

## v32 adjustments
- Android MapLibre start and end pins render as DOM markers with `시작 ▶` and `종료 ■`; they no longer inherit `S/E` from the GPU atlas.
- When points are less than 38 m apart, only screen-space label positions shift apart; marker coordinate anchors stay at the recorded GPS fixes.
- The export Canvas draws two Korean endpoint badges with icons for a round trip to the same location, instead of the combined `출발·종료` badge.
- All other basemap assets are unchanged. The existing recap route drawing loop retains the same blue stroke.

Native script: `native-maplibre-v32.js` is a byte-for-byte copy of the deployed asset.
Maintained recap source: `../src/ride-recap.mjs`
Maintained CSS: `../src/curated-v9.css`

## Regression checks
Use `node --test rider-spot-web/tests/ride-recap.test.mjs` and test days with near-identical start/end points. For Android, confirm two Korean DOM pins are visible on the Timeline route and the export image, without a missing course line.
