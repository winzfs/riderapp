# Rider Spot — production split Worker release and rollback

Last verified: **2026-11-20**. This file describes the live Worker **version**
and the independently deployed services. Always compare actual Cloudflare
deployment state with this record before any change.

## Current architecture

- Public origin: `https://rider-spot.jazzhjm.workers.dev/`
- Public Worker name: `rider-spot`
- Active split front version: `f764543b-35c5-48a7-9b4e-3b2b76b07b3c`
- Previous monolithic v220 version, **retain for rollback**:
  `44fe53dc-b7a4-4d98-af36-79a8b3dbddc8`
- Front routing config: `rider-spot-web/wrangler.kv-front-production.json`
- Front code: `rider-spot-web/edge/static-edge.mjs` (4.7KB)
- Asset service binding `ASSETS` → `rider-spot-static-candidate-assets`
  (pinned `16c1eecf6bac` assets in Workers KV)
- API routing `LEGACY` → `rider-spot-api-core-qa` (13.8KB API/OAuth)
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
