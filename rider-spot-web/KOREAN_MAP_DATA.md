# Rider Spot Korean map-name sources (2026-11-18)

## Live implemented source

The existing nationwide OpenFreeMap/OpenMapTiles vector source is used for Korean-first
POI **text labels**. `src/korean-map-labels.mjs` renders important facilities from
zoom 13.7 and businesses at zoom 16.2, without icons. `basemap.mjs` keeps the
base style's POI marker layers hidden and retains the toilet-only interactive
facility overlay. Coverage is limited to what is present in OpenStreetMap.

This is NOT a complete nationwide Korean address, apartment or business register.

## Public-data enrichment that needs an actual import

| Data | Public source | What to preserve |
| --- | --- | --- |
| Administrative and town names | MOLIT V-World administrative boundaries, data.go.kr 15059008 | code/name, correct centroid or point-on-surface, source date |
| Apartment and building names | MOIS road-name address building/NAVI DB, business.juso.go.kr | official building name, coordinates, address/building identifier |
| Store names | SEMAS business-area information API, data.go.kr 15012005 | trade name, category, lat/lon, update date, establishment ID |
| Major public services | MOLIT search/POI API data.go.kr 15058799; OSM | feature category, name, coordinates, source date |

Do not copy names from proprietary commercial map tiles or scrape Naver/Kakao search
results. Before using any official dataset, check the *specific distribution's*
reuse terms and required attribution. Some government downloads and APIs require
registration/approval keys; never commit keys in a web bundle.

For a nationwide release, import the authorized data **server-side**, normalize
to WGS84 coordinates, remove duplicates/closed stores, classify
`region | apartment | building | shop | facility`, and generate tiled
PMTiles or per-area vector datasets served by the existing Worker/R2.
Load only the current viewport/zoom. Keep Korean-first labels collision-aware
and lower priority than district names and route annotations. Use non-interactive
text labels; never restore the shelter/gas/repair pins. Update business data
on a provider-approved cadence and verify source dates.

Do **not** put the full nationwide business data into `app.mjs`, query an
external geocoding endpoint on every pan, or expose a V-World/data.go.kr API
key to the Android WebView. The POI vector layer shipped in this change is
the no-key first step; the government records are **not** ingested yet.

## Implemented offline importer

Run `node scripts/import-korean-places.mjs /path/to/authorized-semas.csv /tmp/gwangju-shops.geojson shop`.
JSON API arrays are also supported. It normalizes the SEMAS `bizesNm`,
`bizesId`, `lon`, `lat` and `indsSclsNm` fields, rejects out-of-range
coordinates and duplicate source IDs. The generated GeoJSON is **not** yet
shipped to the map: nationwide public records require an authorized download,
spatial tiling and a deployment plan. Do not commit API keys or a raw nationwide
dataset to GitHub.

## Automated updates (installed)

The schedule lives on the GitHub **default branch** `main`, in
`.github/workflows/rider-spot-korean-map-schedule.yml`, because GitHub ignores
cron schedules on feature branches. It checks out
`feature/rider-spot-native-apk` and runs each **Monday at 04:17 KST**.

- Select the latest dated public Gwangju SEMAS CSV available from the
  `ginipick/market` mirror; no API token is required. **This mirror currently
  exposes 2025-06, so a successful weekly job does not imply that SEMAS has
  published a more recent snapshot in the mirror.**
- Optional recommended direct official data feed: set repository variables
  `KOREAN_SHOPS_CSV_URL` (approved HTTPS CSV endpoint) and
  `KOREAN_SHOPS_SNAPSHOT` (YYYYMM). If the source is a ZIP, extract the Gwangju
  CSV before publishing it to this endpoint. Do not put a secret or private API
  key in either variable or the source URL. Use GitHub Secrets plus a
  credential-aware fetch implementation instead.
- Convert selected CSV and V-World administrative GeoJSON to bounded grid
  files. Confirm counts, source period, geometry, bounds, build and tests.
  Refuse suspicious decreases, malformed data or source download errors.
- If and only if the generated files change, commit the derived labels (not
  the source CSV) to the app branch. The Worker reads the active branch at
  `/mapdata/*.json` with a bounded 30-minute edge/browser cache. Existing
  app bundles do not need rebuilding just for new source records.
- Existing users receive refreshed data on a subsequent map visit/reload;
  the app does **not** interrupt an active ride or refresh all tile data
  while a route is in progress.
- The previously hand-entered Gwangsan overview label layer has been removed.
  Local OSM place symbols are geographically suppressed in the public-data
  area; cities, roads and labels outside the coverage remain on OpenFreeMap.
- Other regions continue to rely on regularly updated OpenFreeMap/OSM data.
  The scheduled SEMAS import currently covers **Gwangju only**.

### Maintenance checks

The Actions run must show `Selected SEMAS public snapshot`, `PASS safe
source change`, and either `No changed names` or a validated data commit.
The first end-to-end weekly refresh dry-run completed successfully on
2026-11-18 KST. A 2025-06 source merely produces a no-change check, not
a false claim of fresher data.

For live data integrity, see the deployed `/mapdata/manifest.json`; confirm
`counts`, `sources` and tile availability. The app release path still
needs a separate tested deployment for application code changes.
