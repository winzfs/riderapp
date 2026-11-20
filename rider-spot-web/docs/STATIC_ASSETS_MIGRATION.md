# Rider Spot — staged migration to Workers Static Assets

## Production must remain unchanged until backend separation is verified

The live service remains at https://rider-spot.jazzhjm.workers.dev/ and uses
the original Worker named rider-spot. Its script contains API routes, OAuth,
legacy JS/CSS and a native-recovery safeguard. It cannot safely be replaced
with a static-only Worker. DO NOT overwrite rider-spot using the preview config.

The v217 native recovery guard is inserted into the HTML by the existing
Worker and is not in dist/index.html. The preview front loads only that guard
from the original Worker and refuses to serve the new shell if it is absent.
Keep the original Service Worker activation policy and rollback version.

## What is now separated in the repo

1. The existing build compiles UI JS/CSS, HTML, Service Worker and public
   map data into rider-spot-web/dist. Its hashed asset paths remain immutable.
2. wrangler.static-preview.json declares a NEW independent Worker named
   rider-spot-static-preview with Cloudflare Static Assets, plus ASSETS and
   LEGACY service bindings. It does not rename or replace production.
3. Cloudflare serves matching files in dist without reading, modifying or
   embedding them in the large legacy Worker source.
4. The edge/static-edge.mjs fallback delegates API, old scripts, old CSS and
   unmatched routes to the running legacy Worker while preserving request
   method, query, cookies, headers and body.
5. Root HTML gets the existing v217 native recovery guard inserted from the
   legacy Worker. It fails closed if the safeguard is missing.
6. The isolated preview Worker can be removed without changing the
   production URL, APK, stored trips, OAuth or Worker version.

The preview uses a different hostname, so localStorage, cookies, login
callback allowlists and some WebView flows cannot be considered production-
equivalent until verified on the original hostname.

## Tests and preview release

The GitHub Action rider-spot-static-preview.yml performs the unit suite,
native anti-reload guard, and independently builds Static Assets.
It ONLY deploys rider-spot-static-preview if a Cloudflare API token is
configured as CLOUDFLARE_API_TOKEN or CF_API_TOKEN in GitHub Actions.
It then checks the real preview HTML guard, CSS, Service Worker and
legacy-asset fallback. If credentials are unavailable, the workflow keeps
its tested artifact but does not touch production.

Local or authenticated CI commands:

    cd rider-spot-web
    npm ci
    npm test
    npm run build
    npx wrangler@4.53.0 deploy -c wrangler.static-preview.json

The second deployment step MUST NOT be changed to a production Worker name.

## Production cutover gate — not yet satisfied

Before replacing the original production name:

1. Export a complete, tested copy of the exact existing backend Worker script
   and all bindings/OAuth settings. The full inline source was streamed successfully on 2026-11-20,
   without duplicating the 56 MB payload in memory.
2. Deploy that backend as a separate stable service (`rider-spot-backend` deployed 2026-11-20).
   Compare auth, every API method, old asset URLs, mapdata, errors and native
   offline trip restoration against the original. Do not guess API code.
3. Change LEGACY service binding in the front Worker to this independent backend
   service and retest. Staging binding updated 2026-11-20. The target must never be self.
4. Confirm Android WebView and browser sessions on the original origin can
   still load historic Service Worker caches and immutable legacy URLs.
5. Only then release the slim front under the original rider-spot name,
   retaining a tested instant rollback to the previous Worker version.
6. Once old-client traffic has drained, move old static resources from the
   backend to ASSETS, retaining needed historical versions.

Until these are verified, the existing production Worker remains at its
known-good version; no production migration is claimed.

## Live staging status — Cloudflare KV bridge (2026-11-19)

### What has actually been deployed

Three **non-production** Workers are now active, including the backend clone:

| Worker | Purpose | Binding |
| --- | --- | --- |
| `rider-spot-static-preview` | Front-end entry point, native recovery guard insertion and legacy pass-through | `ASSETS` service to candidate worker; `LEGACY` service to `rider-spot-backend` |
| `rider-spot-static-candidate-assets` | Serve pinned static UI and public map data from Cloudflare Workers KV | `RS_ASSETS` KV namespace `d268cb25c64445cf9bb67242b79edc28` |
| `rider-spot-backend` | Exact v220 source clone, APIs/OAuth/old URLs | No bindings; public workers.dev disabled |

The test origin is https://rider-spot-static-preview.jazzhjm.workers.dev/ .
The original https://rider-spot.jazzhjm.workers.dev/ still uses **v220
version `44fe53dc-b7a4-4d98-af36-79a8b3dbddc8`** and has not been
replaced.

The preview asset Worker previously fetched from raw.githubusercontent.com.
That temporary behavior has been removed from its active deployed version.
Cloudflare KV now stores **56 keys**, comprising the **55 actual release
files** (JavaScript, CSS, HTML, Service Worker and 42 Korean map-data JSON
files) plus the release manifest `release.json`. Total pinned static content
is approximately 6.8 MB. The content comes from frozen release
`16c1eecf6bac` at GitHub commit
`6e6bd2d905db57d34408b22aa1b4292e01d92d37`, not from the
latest moving branch tip.

The KV namespace is **preview-only** and stores public app assets, not rider
profiles, saved routes, financial records or API secrets. Existing app state,
authenticated API endpoints, legacy routes, prior immutable asset URLs and
native SQLite records continue to be owned by the original Worker/Android app.

### Reproducible deployment configurations

- `wrangler.kv-assets-preview.json`: current KV asset gateway, bound to
  `RS_ASSETS`.
- `wrangler.kv-front-preview.json`: current front end, bound to `ASSETS`
  and `LEGACY` services.
- `wrangler.static-preview.json`: desired **future** native Workers Static
  Assets deploy configuration, not what the current KV bridge uses.
- `edge/kv-preview-assets.mjs`: strict current-release file allowlist;
  missing required files return HTTP 503 instead of silently mixing bundles.
- `edge/static-edge.mjs`: legacy fall-through and fail-closed native recovery
  guard.
- `tests/kv-preview-config.test.mjs`: ensures neither staging config can
  overwrite `rider-spot` or bind the front end to itself.

With appropriately configured Cloudflare credentials, rebuilding the **same
staging topology** uses:

```sh
cd rider-spot-web
npm ci && npm test && npm run build
npx wrangler@4.53.0 deploy -c wrangler.kv-assets-preview.json
npx wrangler@4.53.0 deploy -c wrangler.kv-front-preview.json
```

The KV namespace must already contain every pinned release file before
the first staging deployment; the setup above is not an asset uploader.
Do not change either configuration name to `rider-spot`.

### Verified checks and limitations

- `docs/static-preview-qa.json`: live HTTP checks, native guard, current
  stylesheet and app code, older release fallback, public map data, and
  read-only API **routing parity**.
- `docs/static-preview-browser-qa.json`: mobile Chromium widths 320, 393
  and 412px; 5 bottom tabs, no horizontal overflow, no JavaScript runtime
  errors, and no full-page auto-reload. Each tested CSS response contains
  `x-rs-preview-asset-origin: workers-kv`.
- `docs/static-preview-bundle-qa.json`: **55/55** public release files
  match the pinned GitHub release byte-for-byte via SHA-256, including
  the native Service Worker, CSS and public Korean map tiles.

The existing industry-news endpoint returned HTTP **502** on both original
production and preview during one read-only comparison. This establishes
routing parity on that request, **not** API health.

The anonymous browser test did not display authenticated income-chart data,
so chart tapping and persistence still require a signed-in acceptance test.
Real Android WebView GPS start/stop, background recovery, locked-screen trips
and SQLite preservation have not been exercised on the preview hostname;
anonymous Chromium evidence is not a replacement for those release gates.

### The remaining production blocker

Cloudflare's connected management API successfully created an official
Static Assets upload session, but **the asset upload failed HTTP 401**.
The same result occurred when the returned session JWT was explicitly used
as the Authorization bearer token for a direct upload request. The session
exists, but this connection cannot complete the official upload; the precise
authorization restriction remains unresolved. Do not interpret successful
session creation as successful asset deployment.

GitHub Actions currently has no configured Cloudflare deploy secret; its
native Static Assets workflow can run builds but cannot publish assets.
A user-authorized Wrangler CI token or JWT-capable upload client is needed
to enable native Workers Static Assets.

**More importantly**, the monolithic v220 backend has been cloned using
streaming, but authenticated API, native GPS, restore and production cutover
tests are still outstanding. The staging front binds to `rider-spot-backend`,
not the live `rider-spot`, and must never bind to itself.

The current KV bridge removes the immediate GitHub runtime dependency and
proves that a lean front can delegate server work, but it is **not** the
final no-KV-charge native Static Assets solution and **not** a completed
production cutover. Both staging Workers can be disabled without changing
the original production version.

## Update — 2026-11-20: backend clone is deployed

- Production script (v220) remains version `44fe53dc-b7a4-4d98-af36-79a8b3dbddc8`.
- Backend clone is deployed as `rider-spot-backend`, version `d39faa62-f131-42a0-acea-788e978cdfec`, with public workers.dev disabled.
- Both Worker scripts contain 56,608,825 source characters; independent checksum pairs matched (`3a12274c` and `fa280302`). Compatibility dates and bindings match.
- Staging front now routes `LEGACY` to the isolated backend; static files continue through the preview-only KV gateway.
- Native Static Assets upload still returned 401 on 2026-11-19. Do not cut over production until upload, authenticated end-to-end testing, Android WebView and rollback checks pass.

### Browser Run smoke checks — 2026-11-20

Cloudflare Browser Rendering confirmed that the newly re-bound staging root
returns rendered HTML containing the v217 native recovery guard and the pinned
`16c1eecf6bac` UI assets. A 393px mobile Chromium session with JavaScript
enabled rendered the bottom navigation and timeline/finance elements.
The staging `/api/industry-news` endpoint returned JSON news items from the
isolated backend; the production endpoint separately returned its valid JSON
fallback with an empty `items` array, demonstrating dynamic upstream data and
why anonymous response bodies must not be compared byte-for-byte. No
state-changing API request or authenticated session was used.

Initial GitHub Actions jobs returned `startup_failure` (Nov 20 around 06:15Z),
but execution recovered. **Run 44689230402 passed** the isolated staging
acceptance at 06:40Z: 11/11 configuration/routing unit tests, 11/11
read-only structural HTTP assertions, and live Playwright navigation at
320, 393 and 412px with zero page errors, overflow or full document reload.
The industry-news API returned **502 on both environments**; the successful
check demonstrates routing parity, **not API health**. All tests were
anonymous/read-only; no real Android GPS, OAuth callback, authenticated
records or rollback acceptance has been claimed. Production was not redeployed.

### Direct Static Assets re-test — 2026-11-20

An isolated one-file probe registered `/__rs_static_upload_probe.txt` in an
official staging-only asset-upload session. The returned upload JWT had a
nonempty missing-asset bucket, but the documented `POST /workers/assets/upload`
with `base64=true`, bearer upload JWT and multipart file content returned
**HTTP 401 Unauthorized** again. No candidate asset was attached to a Worker
version. The existing KV-backed staging service remains operational. A
properly authorized Wrangler/CI upload environment is still required for
native Static Assets; this does not block current staging browser tests.

### Automated staging acceptance — 2026-11-20

- GitHub Action: https://github.com/winzfs/riderapp/actions/runs/44689230402
- Repository: `feature/rider-spot-native-apk`.
- Static preview front `LEGACY` binds to `rider-spot-backend` (not production).
- 11/11 isolated routing and native protection unit tests passed.
- 11/11 HTTP route/asset assertions passed; both news APIs returned 502, so
  upstream health remains unresolved.
- Anonymous Chromium browser checks passed at 320, 393 and 412px: 5 tabs,
  no horizontal overflow, runtime errors or document reloads.
- Finance chart selection was not exercised: anonymous session has no chart.
- Production cutover remains blocked on signed-in data read/write, native
  GPS/background SQLite restore, OAuth return and rollback verification.

## 2026-11-20 — Android emulator WebView DOM acceptance

The separately installable staging QA app (applicationIdSuffix `.migrationqa`)
was built by [GitHub Actions run 44694226110](https://github.com/winzfs/riderapp/actions/runs/44694226110).
It loads the isolated preview hostname with a non-conflicting OAuth deep-link
scheme; production Google OAuth is intentionally disabled in the QA app.
Only the QA APK enables WebView debugging for local CDP DOM inspection;
the production Android source and Worker were not modified.

[GitHub Actions run 44695080469](https://github.com/winzfs/riderapp/actions/runs/44695080469)
PASSED Android API 35 emulator acceptance after DNS fallback.
Both initial launch and return from Home exposed all five tabs (지도, 타임라인,
동네, 수익, 내 바이크), a Leaflet map, and the 운행 시작 button, with
no webpage error or AndroidRuntime fatal exception. Screenshots, first/relaunch
CDP JSON proof, and network diagnostics are preserved in the workflow artifact.

Earlier headless emulator attempts exposed transient DNS errors and a Pixel
Launcher system ANR, not Rider Spot app crashes. The new gate asserts actual
rendered WebView DOM, not just a surviving Android process.

This emulator test is not evidence for physical Android 17 background GPS,
real-world 6–9-hour rides, force-stop SQLite recovery, real OAuth callback,
or authenticated cloud records. QA APK must never be used for real deliveries.
The production cutover is still blocked on those gates and a successful
native Workers Static Assets upload (currently 401). Preview KV bridge
remains available for testing. Production rider-spot v220 version
`44fe53dc-b7a4-4d98-af36-79a8b3dbddc8` remains unchanged.

## 2026-11-20 follow-up — 13.8KB API core and native OAuth callback gate

This migration now has **four distinct responsibilities**:
- Public production `rider-spot`: existing v220 script and original client state; **not modified**.
- `rider-spot-static-preview`: 4.1KB front router (Service `ASSETS` to KV gateway; Service `LEGACY` to isolated API core).
- `rider-spot-api-core-qa`: **13,769-character** Worker extracted from the exact deployed v220 handlers for `/api/weather`, `/api/route-match`, `/api/industry-news`, Android OAuth start and root callback. Frozen legacy assets and unknown routes transparently delegate through its `LEGACY_BACKEND` service binding.
- `rider-spot-backend`: unchanged **56,608,825-character** source clone retained for existing, immutable historical files and fallback. It has not been deleted or cut over.

The small core is version-controlled in `edge/api-core.mjs`. Its
`wrangler.api-core-preview.json` is isolated, has `workers_dev: false`,
and binds `LEGACY_BACKEND` only to `rider-spot-backend`. Front
configurations and CI enforce the chain `front → api-core → legacy-clone`,
never `front → production` and never a self-binding.

### Blocking native Android OAuth issue found and fixed

Previously `static-edge.mjs` intercepted **every** `GET /` and served the
new app shell, including the one-time browser-to-app OAuth callback that uses
an HttpOnly `rs_android_oauth` nonce cookie. That would have broken native
Google login after a production cutover even though anonymous browser tests
were green.

Now `GET /` with a properly shaped 32-hex-character OAuth nonce cookie
passes through to the API core before ordinary shell routing; other
requests retain the native v217 recovery guard. The native callback's
`Set-Cookie`, CSP and response body are preserved unchanged.
New unit tests enforce both cases. This fix is **deployed to staging only**.
Cloudflare Browser Rendering verified after the front bound to the small API
core: app shell HTTP 200 with 5 tabs and recovery guard, OAuth return HTML
HTTP 200, invalid weather coordinates HTTP 400, and legacy JS HTTP 200.

### Data integrity and remaining release blockers

Read-only Supabase inspection verified that the 28 public tables in the
currently connected project have RLS enabled. The primary private
ride/finance/maintenance/user settings policies have `auth.uid() = user_id`
ownership checks. No production data were altered by this inspection.

Cloudflare native Static Assets direct upload continues to return HTTP
401 Unauthorized with this connection; the existing KV-backed staging
gateway remains the functioning fallback. The original 56MB legacy clone
must remain for historical paths until replacement assets and older clients
are accounted for. This architecture avoids large changes to the frontend
Worker but **does not yet eliminate** the legacy clone dependency.

Before promoting **any** new Worker under the public `rider-spot` name:
1. Confirm current login with a real account and successful OAuth return on
   the production hostname; synthetic nonce tests alone are not sufficient.
2. Perform a signed-in read/write/readback/update/delete test with a
   disposable record owned by a consenting test user; never mutate existing
   trip, finance or maintenance history.
3. Run real phone Android WebView/GPS/SQLite active ride, background, screen
   lock, completion and relaunch recovery checks with the existing app.
4. Confirm public static assets, historical URL parity, update/rollback and
   clean start after Service Worker cache transitions.
5. Obtain working Workers Static Assets upload permission or explicitly
   accept KV as the long-term hosting path, then plan a reversible
   production deployment. Original production version to retain:
   `44fe53dc-b7a4-4d98-af36-79a8b3dbddc8`.

No production cutover was performed in this follow-up.
