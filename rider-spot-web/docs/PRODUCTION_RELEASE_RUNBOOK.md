# Rider Spot — production split Worker release and rollback

Last verified: **2026-11-21**. This file describes the live Worker **version**
and the independently deployed services. Always compare actual Cloudflare
deployment state with this record before any change.

## Current architecture

- Public origin: `https://rider-spot.jazzhjm.workers.dev/`
- Public Worker name: `rider-spot`
- Active **Atelier v8 — genuine React screen overhaul** front: `916aa709-12b2-40f3-bcbd-7f439ae9541c` (100%)
- Active immutable v8 app: `7ba6f9cb1359`; pinned build commit `f7ae89197b740f47afb0d8f388fbd7e5607ae89e`
- Active v8 asset Worker: `rider-spot-atelier-v8-assets` (versioned KV, old app hashes retained)
- Active v8 visual Worker: `rider-spot-atelier-v8` (`?rev=20261121-v8`)
- Immediate previous v7 rollback front: `74148419-d426-4187-a250-4313fcb61637`
- Previous **Editorial v7** front: `74148419-d426-4187-a250-4313fcb61637`
- Previous immutable v7 app: `bbd2531a1e8d`; pinned build commit `a4a2173abd52739ce9051e4c404e20c8fbb2c79a`
- Previous v7 asset Worker: `rider-spot-editorial-v7-assets` (version-scoped KV index + SW keys)
- Previous v7 visual Worker: `rider-spot-editorial-v7` (`?rev=20261121-v7`)
- Previous v6b production front for immediate rollback: `84ccf064-b0b1-4a2c-ae76-1738216457d8`
- Previous **Urban Editorial v6b** front: `84ccf064-b0b1-4a2c-ae76-1738216457d8`
- Active immutable v6 JS + CSS: hash `e30517cbf40f`, pin commit `3a010f4866f18098b5ddf9a35eed06e7261067fd`
- Active v6 asset Worker: `rider-spot-urban-v6-assets` version `a7f092b5-6911-44bb-8387-370f7208d786`
- Active v6b final presentation Worker: `rider-spot-urban-v6b` version `193f440d-4f50-45a3-a837-e99f0575d9f0`
- Previous v6 front for immediate style rollback: `738013f7-0ade-4da7-bd9e-8f77d9d8da6e`
- Previous v5 front for full structural rollback: `7db2636b-7944-4fe3-aecc-7ed72727e4a5`
- Prior v5 asset gateway (kept for old clients): `rider-spot-urban-v5-assets`, version `d243ac1d-2c2c-42f8-a2b6-038636356906`
- Prior v5 CSS Worker (kept for rollback): `rider-spot-urban-v5`, version `4ccb89fc-5d24-441b-8755-8dbc2e340856`
- Immutable v5 bundle: `3305352a56bc`, pinned commit `761432d6af30232b06e983a84c535d33236d043c`
- Previous v4 front for immediate rollback: `543b2213-2f6c-4f3b-9ae6-bd2a359675a9`
- Active isolated v4 design Worker: `rider-spot-visual-v4`, version `449b51d4-2eac-4e92-bb4e-04d7d01ee9e3`
- Active v4 hashed assets: `8eb44596629f`, pinned GitHub commit `b715913001e0b55f2d29cbc17acdb72d35a025aa`
- Prior v3 front (first-line rollback): `6a484cb5-1a83-400e-ad3a-6e8c5abb874e`
- Prior v3 CSS Worker: `rider-spot-visual-v2`, version `97c68a72-c0ae-4870-b040-2e4fb37d57d4`
- Previous visual-v2 front version (safe CSS-link rollback): `ea399918-cbff-4de4-994f-5530e1672cef`
- Prior split front version (last known functional fallback): `f764543b-35c5-48a7-9b4e-3b2b76b07b3c`
- Previous monolithic v220 version, **retain for rollback**:
  `44fe53dc-b7a4-4d98-af36-79a8b3dbddc8`
- Front routing config: `rider-spot-web/wrangler.kv-front-production.json`
- Front code: `rider-spot-web/edge/static-edge.mjs` (4.7KB)
- Asset binding `ASSETS` → `rider-spot-atelier-v8-assets` (`rs-asset-v8::shell/<hash>/` HTML/SW; v4-v7 hashed assets preserved read-only)
- Previous v4 gateway remains available: `rider-spot-renewal-assets`
- Previous v3 asset gateway retained: `rider-spot-static-candidate-assets` (pinned `16c1eecf6bac`)
- API routing `LEGACY` → `rider-spot-api-core-qa` (13.8KB API/OAuth)
- Design `DESIGN` → `rider-spot-atelier-v8` (isolated CSS without data/GPS bindings)
- Legacy fallback of the API core `LEGACY_BACKEND` → `rider-spot-backend`
  (the original v220 module, 56,608,825 chars)
- All existing Supabase and Android local SQLite data stores are reused.
  **No database migration** accompanied this cutover.

Cloudflare Workers **Static Assets** upload endpoint remains HTTP 401 with
current connector credentials. The production design deliberately uses
the tested Workers KV gateway instead; there is **no** built-in Static Assets
binding on the production front.

## Built-in application failover

If the KV asset gateway cannot serve a valid home HTML, the front Worker
uses its legacy service binding to serve the original v220 guarded shell
with `Cache-Control: no-store` and `X-RS-Fallback: v220`. An absent
native recovery guard must fail closed rather than sending unguarded HTML.
Historically versioned JS/CSS and unmatched routes still pass through
to the legacy backend. This does not guarantee recovery from a simultaneous
legacy-backend failure or from client-side cached assets.

## Non-destructive production verification

- [Rider Spot production split acceptance](https://github.com/winzfs/riderapp/actions/workflows/rider-spot-production-split-acceptance.yml)
- [Rider Spot inactive candidate acceptance](https://github.com/winzfs/riderapp/actions/runs/44756084343)
- [Rider Spot split staging acceptance](https://github.com/winzfs/riderapp/actions/runs/44698546291)
- [Android staging WebView first-launch/relaunch](https://github.com/winzfs/riderapp/actions/runs/44698813634)

The live acceptance script checks actual public HTML, native recovery guard,
new release CSS/JS, historical assets, Service Worker update policy, OAuth
nonce callback, weather and road matching input validation, and response
parity against the isolated staging host. Browser acceptance tests five
navigation tabs at 320, 393, and 412px and unintended full reloads.

These checks are anonymous/synthetic. **They cannot prove** that Google
OAuth succeeds with a real user's account, signed-in Supabase edits work,
or a physical Galaxy preserves an active GPS/SQLite ride after lock-screen
and app relaunch. These physical/account tests should be completed as
the remaining post-release field acceptance. See
`docs/ANDROID_MIGRATION_ACCEPTANCE.md`.

## Immediate rollback (code only)

If production has a critical refresh loop, blank home page, old assets
returning 404/503, failed login callback, or Android trip state reset,
**restore version v220**. Do not delete either Worker, existing KV keys,
Supabase rows, or phone SQLite storage.

With authorized Cloudflare API/Workers Scripts Write access, use the
Cloudflare Worker deployment API:

```http
POST /client/v4/accounts/<account_id>/workers/scripts/rider-spot/deployments
Content-Type: application/json
Authorization: Bearer <CLOUDFLARE_API_TOKEN>
```

```json
{
  "strategy": "percentage",
  "versions": [
    {
      "version_id": "44fe53dc-b7a4-4d98-af36-79a8b3dbddc8",
      "percentage": 100
    }
  ],
  "annotations": {
    "workers/message": "Emergency rollback to monolithic v220"
  }
}
```

Verify the `GET /deployments` endpoint now reports **100% on v220**.
Then rerun production HTTP and Android checks. Existing PWA clients may
retain a cached shell until they close/relaunch; no rollback should
delete local trip records or Service Worker caches manually.

To re-release, first pass the newest production candidate QA and verify
the API core, KV asset gateway, physical device, login and data gates.
**Do not use a 1% / 99% split** for this migration: a new HTML request and
its hashed CSS/JS may land on different versions, making partial rollouts
unsafe without request-affinity routing.

## CI deployment credentials

GitHub Actions currently contains neither `CLOUDFLARE_API_TOKEN` nor
`CF_API_TOKEN`; the credential capability check intentionally prints only
presence/absence and does not expose secrets. Native Workers Static Assets
upload also returned HTTP 401 with the connected Cloudflare session. No
secret was committed to source control.

## Visual-v2 update — 2026-11-21

The new presentation-only overlay includes a deep-teal Rider Spot header,
a new active bottom-nav treatment, stronger financial hero hierarchy, clearer
bike/model and maintenance tiles, timeline summary/calendar styling and
cleaner community cards. Source of truth:

- `src/visual-v2.css` — visual stylesheet
- `edge/visual-v2-worker.mjs` — the corresponding CSS delivery Worker
- `edge/static-edge.mjs` — link insertion and dedicated immutable CSS route
- `wrangler.kv-front-production.json` — production service bindings

No APK code, React routing, GPS events, Supabase tables or existing KV
release bundles were modified. Old UI remains the automatic fallback if
the new CSS request fails; the v220 shell fallback still handles failed
KV home loads. For emergency full rollback deploy the prior split Worker
version `f764543b-35c5-48a7-9b4e-3b2b76b07b3c` at 100%, or use
monolithic `44fe53dc-b7a4-4d98-af36-79a8b3dbddc8` if the split stack
itself has failed. Do not delete local app data or Service Worker caches.

## Premium v3 rollout — 2026-11-21

The production front Worker `rider-spot` was deployed with **100%** traffic to
version `6a484cb5-1a83-400e-ad3a-6e8c5abb874e`. The isolated design
Worker `rider-spot-visual-v2` was deployed with **100%** traffic to version
`97c68a72-c0ae-4870-b040-2e4fb37d57d4`.

The front changes only the visual stylesheet link by appending
`?rev=20261121-p3`; the isolated design Worker serves the new CSS from
`src/visual-v2.css`. The existing API routing, Android OAuth cookie handler,
recovery guard, hashed assets, Supabase data, service worker, trip storage,
map camera and GPS implementations remain untouched. The stylesheet is
presentation-only; navigation and recorded data are not migrated.

- Production: https://rider-spot.jazzhjm.workers.dev/
- Live CSS: https://rider-spot.jazzhjm.workers.dev/rider-spot-visual-v2-20261121.css?rev=20261121-p3
- Browser + regression CI: https://github.com/winzfs/riderapp/actions/workflows/rider-spot-premium-v3-live.yml

**Code rollback**: Set `rider-spot` Worker deployment to front version
`ea399918-cbff-4de4-994f-5530e1672cef` at 100%. If the CSS worker itself
is problematic, also restore design Worker version
`6f4b2318-3526-40fb-9310-792390ff8558` to 100%. Never delete KV keys,
local trip data or production backend services for a style rollback. The
original monolithic v220 fallback version
`44fe53dc-b7a4-4d98-af36-79a8b3dbddc8` remains a separate last-resort
rollback, to be used only for critical core failures.

## Native-first v4 React renewal — 2026-11-21

Cloudflare production deployed version `543b2213-2f6c-4f3b-9ae6-bd2a359675a9` at
**100%**, after isolated preview on
`rider-spot-renewal-preview.jazzhjm.workers.dev` passed the 320, 393,
412px five-tab UI/no-reload checks, synthetic finance/maintenance CRUD, and
native safety gates. The frontend now serves new hashed **React**
`app.mjs` plus `renewal-layout.css` from `rider-spot-renewal-assets`;
this is not a CSS-only overlay. Design CSS is independently served from
`rider-spot-visual-v4`. Immutable release `8eb44596629f` is
pinned to GitHub build commit `b715913001e0b55f2d29cbc17acdb72d35a025aa`.

Specific changes include chart-before-goal information hierarchy and smaller
finance summary, embedded bike odometer/model controls, 3-record bike history
with opt-in full history, smaller timeline calendar/map playback UI, and
flat community feed rows. All original CRUD data and GPS/map/storage flows
are retained.

- Screen-by-screen design and invariants: `docs/RENEWAL_V4_DESIGN_SPEC.md`
- Build QA: https://github.com/winzfs/riderapp/actions/runs/44815250975
- Preview QA: https://github.com/winzfs/riderapp/actions/runs/44816368268
- Live QA: https://github.com/winzfs/riderapp/actions/workflows/rider-spot-renewal-v4-live.yml

**Immediate non-destructive rollback**: Deploy previous `rider-spot`
version `6a484cb5-1a83-400e-ad3a-6e8c5abb874e` at **100%**.
That version retains its original `ASSETS` gateway and `DESIGN` binding;
no KV key, Supabase row, SQLite record or WebView cache deletion is needed.
If both split releases are unavailable, monolith v220
`44fe53dc-b7a4-4d98-af36-79a8b3dbddc8` remains the deeper emergency
rollback. Never deploy a 1%/99% mixed-hash front split.

Native personal-account OAuth, several-hour real GPS tracking through lock
screen, and split-screen device behavior still require real-device
acceptance; browser fixtures cannot prove those conditions.

## Urban Editorial v5 release — 2026-11-21

Production `rider-spot` is deployed at 100% to `7db2636b-7944-4fe3-aecc-7ed72727e4a5`.
Compiled release `3305352a56bc` is pinned to verified build commit `761432d6af30232b06e983a84c535d33236d043c`.
This is a fully working hashed UI with bundled and isolated urban v5 CSS, not an image mockup.
Design is deliberately subdued: a single charcoal header, warm white canvas, strong numbers, minimal borders, compact navigation, discreet lime accent and original bike pictograms.
All route/GPS, Supabase, native bridge, record CRUD and WebView lifecycle code is preserved; previous v4 hashed app can still be served for running clients.

- Style source: `src/urban-editorial-v5.css`
- Cloudflare design worker source: `edge/urban-v5-worker.mjs`
- KV gateway with old-client compatibility: `edge/kv-urban-v5-assets.mjs`
- Release test: https://github.com/winzfs/riderapp/actions/runs/44863116908
- Isolated preview: https://github.com/winzfs/riderapp/actions/runs/44863323412
- Live verification: https://github.com/winzfs/riderapp/actions/runs/44863562742

**Immediate rollback**: Set the previous `rider-spot` v4 deployment version `543b2213-2f6c-4f3b-9ae6-bd2a359675a9` to 100%. Never delete user data, KV keys, caches or Android SQLite to roll back visual changes.
Real S24+ long-running GPS, split-screen and Android account flows remain separate on-device acceptance tasks.


## Actual React screen re-layout v6b — 2026-11-21

After feedback that v5 was predominantly a recolor, v6 changes the actual React DOM and screen order:

- Map: `MapBar` (region/share, filters, weather slot) is re-parented **inside** the live `map-wrap` above the Leaflet map; overlaid, no camera transform or GPS lifecycle changes.
- Earnings: period selector, daily amount, expense/net summary and income/expense entry are grouped into a new `rs6-finance-stage` workbench; chart/goal grouped in `rs6-finance-analysis-grid`.
- My Bike: vehicle controls and entry actions are contained in `rs6-garage-stage`; six parts are now 2-column horizontal service instruments in `rs6-service-board`; records have a separate ledger area.
- Timeline: compact date controller and **route map before daily recap**, plus route heading. No route point changes.
- Community: new masthead/filter area and plain feed. v6b fixes a v32-specificity conflict that left old rounded post cards visible in v6.

Immutable bundle `e30517cbf40f` is frozen at `3a010f4866f18098b5ddf9a35eed06e7261067fd`.
v6b changes only the final isolated CSS Worker and its cache-busting link `?rev=20261121-v6b`; v6b does not modify the compiled app, GPS, database or WebView.

- V6 build + native/CRUD checks: https://github.com/winzfs/riderapp/actions/runs/44865241701
- V6 isolated mobile preview: https://github.com/winzfs/riderapp/actions/runs/44865462082
- V6b corrected-feed preview: https://github.com/winzfs/riderapp/actions/runs/44865985414
- V6b live UI/records validation: https://github.com/winzfs/riderapp/actions/runs/44866209459

**Rollback**: Deploy prior `rider-spot` `738013f7-0ade-4da7-bd9e-8f77d9d8da6e` at 100% to roll back the v6b feed CSS only. Deploy `7db2636b-7944-4fe3-aecc-7ed72727e4a5` at 100% to roll back all v6 React layout changes to v5. Never delete KV version keys, service worker caches, Supabase or Android SQLite for a design rollback. Real Galaxy S24+ long-session ride, native OAuth and split-screen still require physical testing.


## Native Editorial v7 deployment — 2026-11-21

Cloudflare production `rider-spot` was promoted to version
`74148419-d426-4187-a250-4313fcb61637` at 100% traffic after isolated
preview UI, 320/393/412px layouts, no reload/JS errors, synthetic finance and
maintenance CRUD, and Android WebView bridge regression acceptance all passed.
The latest pinned compiled frontend bundle is `bbd2531a1e8d` from
`a4a2173abd52739ce9051e4c404e20c8fbb2c79a`.

The change removes artificial English numbered decoration, fake lime brand
markers and nav-strip flourishes, removes duplicated bike model selector,
regroups region/weather into one map-control row and all filters/share into
an equal-width row, moves daily timeline recap before the route map and
shortens its map header. Finance and Community share compact typography and
flat separators; original bike artwork is unchanged.

Critical WebView release safety: the new KV asset gateway indexes immutable
`index.html` and `sw.js` by the release hash. Earlier v7, v6, v5 and v4
hashed scripts remain fetchable to avoid breaking existing clients on an
in-flight session. No GPS, map camera, SQLite, Supabase, account, OAuth,
ride session or user record changes were made for this design release.

- Verified build: https://github.com/winzfs/riderapp/actions/runs/44878268519
- Final preview acceptance: https://github.com/winzfs/riderapp/actions/runs/44878582702
- Production acceptance: https://github.com/winzfs/riderapp/actions/runs/44878851050

**Immediate rollback**: Set production `rider-spot` to previous
`84ccf064-b0b1-4a2c-ae76-1738216457d8` at **100%**. Do not delete
KV caches, old compiled assets or user records; all old bindings are still
available. Physical Galaxy S24+ long ride, screen-lock GPS and OAuth sessions
require on-device acceptance; browser tests do not prove those cases.

## Atelier v8 full React screen overhaul — 2026-11-21

Production `rider-spot` front `916aa709-12b2-40f3-bcbd-7f439ae9541c` deployed at 100% traffic.
Immutable compiled release `7ba6f9cb1359` is pinned to `f7ae89197b740f47afb0d8f388fbd7e5607ae89e`.
This release changes React JSX layout rather than just adding a visual CSS skin.

- Map: visible region/weather + closed-on-start, functional tool drawer with layer filters and sharing.
- Finance: big-number earnings console integrates chart and income/expense action. Analysis uses large gross with secondary metrics; zero-money expenses and maintenance links collapse on demand; settlement highlights outstanding amount.
- My Bike: contrasting illustrated motorcycle cockpit, due/overdue service alerts, retained v197 parts assets, inline settings drawer that does NOT cover primary buttons on 360px split screens.
- Community: compact masthead, collapsed filters/search, chronological card-free feed.
- Timeline: original location/route playback controls, trip summary above the map.

Key source files: `src/finance-ui.mjs`, `src/mobile-records.mjs`, `src/application.mjs`, `src/atelier-v8.css`, `edge/atelier-v8-assets.mjs`, `edge/atelier-v8-worker.mjs`.
Build and native/CRUD acceptance: https://github.com/winzfs/riderapp/actions/runs/44886663575
Isolated preview acceptance: https://github.com/winzfs/riderapp/actions/runs/44886955595
Live production acceptance: https://github.com/winzfs/riderapp/actions/runs/44887356350

**Rollback**: set 100% production traffic back to `rider-spot` Worker version `74148419-d426-4187-a250-4313fcb61637`.
Never delete old KV hashed scripts, older HTML/Service Worker cache keys, SQLite sessions or Supabase records as part of a visual rollback.
GPS map camera, Android WebView/bridge, account OAuth, trip status, backend services and user data were not modified.
Automated browser/native bridge testing does not replace real S24+ extended ride, screen lock and split-screen acceptance.


## Urban Editorial v12 map · timeline · neighborhood release — 2026-11-22 KST

Production Worker `rider-spot` is deployed at **100%** to version
`590e611d-46b3-4f18-9eed-e0a4b4ed4a1f` (deployment
`0c1071a9-c68e-47f9-826a-6270e99bb4a7`). Immutable app hash
`57888bba6c49` is pinned to compiled frontend snapshot
`f768d1bad5bab9a8efe75979cc886864063cc659`.

- Map: in-map region/weather command row; separate single-choice map layers and explicit
  location-sharing switch; existing Leaflet map camera, GPS and report bindings retained.
- Timeline: daily recap before route; selected-date route heading with image export;
  independently operable event/time toggles and overflow road matching; saved rides and
  playback logic unchanged.
- Neighborhood: content-first feed, area/date above each actual post, compact collapsed
  search/filter, editorial separators, no synthetic post metadata.
- Design: light surfaces, restrained blue primary, unified bottom nav and touch targets,
  scoped responsive rules for 320–412px and reduced-motion support.
- Backend and original Worker script were **not** modified. The production frontend
  `ASSETS` service binding alone changed from `rider-spot-recap-v5-assets` to
  `rider-spot-v12-preview-assets`. `LEGACY` remains `rider-spot-api-core-qa`,
  `DESIGN` remains `rider-spot-atelier-v8`. Existing KV data, user records,
  old hashed bundles, Android SQLite, OAuth, and Service Worker cache keys were not cleared.
- Isolated pre-release acceptance (320/393/412px 5 tabs, no reload, no page exceptions,
  authenticated local fixtures, historical asset compatibility):
  https://github.com/winzfs/riderapp/actions/runs/44937369496
- Public production HTTP + browser acceptance **PASSED**:
  https://github.com/winzfs/riderapp/actions/runs/44937700730
  (screenshots attached to that workflow run).
- Unit tests: 203 PASS; finance, odometer, maintenance, route, WebView update safety
  and image recap regression CI passed.

**Immediate non-destructive rollback:** deploy the previously verified
`rider-spot` version **`83a8d6f6-e299-4c89-adc9-33a89711129f`**
with 100% traffic using Cloudflare Workers deployments API. Keep all asset workers,
KV keys and device data unchanged. The previous pinned v5 frontend release
`0edfbcdd3450` remains accessible to existing WebView sessions. New users may
need to close/reopen the app to refresh their cached shell; do not force-delete
Service Worker caches or trip records.

**Remaining real-device acceptance:** a personal account OAuth login, long live
GPS ride through background/screen lock, native-back navigation and Samsung split
screen on a physical Galaxy S24+. Synthetic browser QA alone cannot certify
those physical/session-dependent behaviors.
