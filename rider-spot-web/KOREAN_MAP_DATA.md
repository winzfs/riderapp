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
