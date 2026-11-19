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
   and all bindings/OAuth settings. The connected API could not retrieve its
   oversized inline source without exceeding memory limits.
2. Deploy that backend as a separate stable service (e.g. rider-spot-backend).
   Compare auth, every API method, old asset URLs, mapdata, errors and native
   offline trip restoration against the original. Do not guess API code.
3. Change LEGACY service binding in the front Worker to this verified
   independent backend service and retest. The target must never be self.
4. Confirm Android WebView and browser sessions on the original origin can
   still load historic Service Worker caches and immutable legacy URLs.
5. Only then release the slim front under the original rider-spot name,
   retaining a tested instant rollback to the previous Worker version.
6. Once old-client traffic has drained, move old static resources from the
   backend to ASSETS, retaining needed historical versions.

Until these are verified, the existing production Worker remains at its
known-good version; no production migration is claimed.

## Live staging status (2026-11-19)

The isolated preview is deployed at
https://rider-spot-static-preview.jazzhjm.workers.dev/ .
It is NOT yet a true Workers Static Assets deployment. The Cloudflare
connector successfully opened an assets-upload session, but the upload
endpoint rejected its credentials (401): it requires the session JWT, which
this connector cannot send as a per-request Authorization override.

To validate routing without changing production, two small Workers were
deployed independently:
- `rider-spot-static-candidate-assets`: preview-only, immutable GitHub
  resource gateway for release `16c1eecf6bac`, pinned to commit
  `6e6bd2d905db57d34408b22aa1b4292e01d92d37`.
- `rider-spot-static-preview`: separate front Worker with service bindings
  `ASSETS` to the candidate gateway and `LEGACY` to original `rider-spot`.

An initial mobile regression exposed a sandbox Content-Security-Policy from
raw.githubusercontent.com. The gateway now creates its own content headers
instead of forwarding GitHub's sandbox restrictions, with a versioned cache
key so restricted cached copies are not reused.

Automated reports:
- `docs/static-preview-qa.json`: live HTTP, current and previous release
  assets, native recovery guard, offline Service Worker, map data and
  read-only legacy API status/content-type parity.
- `docs/static-preview-browser-qa.json`: anonymous Chromium at 320, 393
  and 412 px, five tabs, no horizontal overflow, no runtime JS errors or
  unexpected full-page reloads.

Authenticated income charts and real Android ride recording have not been
certified on this new hostname. The original `rider-spot` production Worker
remains unchanged.

**Production cutover remains blocked** until a legitimate JWT-capable
Static Assets upload/CI route is available AND the oversized legacy Worker
can be reproduced as a separately bound, verified backend. Do not point
`LEGACY` back at `rider-spot` if this front is ever deployed under that
same name: that would create a circular binding.
