# Rider Spot QA Workbench

Independent operations and QA console for Rider Spot. This is **not** the production application or a native ChatGPT Sites artifact.

- QA console: https://rider-spot-qa.jazzhjm.workers.dev/
- Production: https://rider-spot.jazzhjm.workers.dev/
- Production code branch: `feature/rider-spot-native-apk`
- QA branch: `feature/rider-spot-qa-console`
- Supabase project: `rider-spot` (region ap-northeast-2)
- Cloudflare QA Worker: `rider-spot-qa`, distinct from production Worker `rider-spot`

## Data isolation

The QA fixtures for riders, posts, trips, earnings, maintenance, bugs and test results are stored **only in the current browser's localStorage** under `rider-spot-qa-v1`. They are not transmitted to Supabase, and they do not appear to real riders. Use the built-in JSON export/import to move the test dataset between devices or to keep a backup. Clearing browser data removes it. The worker's `/api/status` endpoint sends a read-only GET request to the public production URL; HTTP response checks are not functional app tests.

The site is published without an admin login because it contains no real user data and makes no backend writes. **Never add production keys, service-role credentials, real rider locations or personal earnings to this console.** Before integrating shared/persistent QA data, create a private QA datastore with authentication, audit logging, rate limiting and scoped role permissions. Do not use production tables to store synthetic locations or posts.

## What the console covers

| Area | Included functionality |
| --- | --- |
| Overview | Deployment metadata snapshot and live basic HTTP availability check |
| Map/riders | Local fixture CRUD, share toggle, presence states and pointer-based map demo |
| Timeline | Local trip fixture CRUD, time/event toggles, 10x/20x/30x path demo, finish-to-earnings flow |
| Posts | Local post fixture CRUD |
| Earnings | Local earnings fixture CRUD and net earnings calculation |
| Bike & maintenance | One entry point, odometer entry, part buttons, latest service distance, full history modal, local fixture CRUD |
| QA | Functional checklist, pass/fail results, issue backlog CRUD |
| System | Actual Supabase table names, code module locations, Cloudflare deployment snapshot, design color/width preview |

### Verification boundaries

1. Map gestures and replay are **independent demos**, not the production map engine or real GPS recordings.
2. The diagnostic checks record results supplied by the tester. A pass is not evidence of a browser automation run.
3. The production app's exact Android WebView, split-screen sizing, background recording, access control, offline behavior and Supabase RLS must be tested separately.
4. The deployment snapshot shown in the UI reflects 2026-11-18 and must not be taken as a dynamically updating release feed.

## Maintenance source of truth

- `rider-spot-web/src/maintenance-model.mjs`, `maintenance-due.mjs`, `maintenance-icons.mjs`
- `rider-spot-web/src/mobile-records.mjs`, `application.mjs`
- `public.maintenance_logs` has `item`, `service_items`, `odometer_km`, `next_due_km`, `cost_won`, `workshop`, etc.
- `public.rider_earnings`: `gross_won`, `expenses_won`, `deliveries`, `work_date`.
- `public.trips`: `started_at`, `ended_at`, `points`, `events`.

This QA console **does not change the production app's navigation**; it models the desired single maintenance flow to test and compare against the real app.

## Deploy and test

Run `node qa-workbench/smoke.mjs` for basic syntax/navigation checks.

Set `CLOUDFLARE_API_TOKEN` (a restricted token with Workers Scripts Write) and `CLOUDFLARE_ACCOUNT_ID` in the local/CI environment, then run:

```sh
node qa-workbench/deploy.mjs
```

The deployment script uploads `index.html` as an inline static Worker module and enables its workers.dev subdomain. Never commit credentials. Note that GitHub and a Cloudflare Worker are not auto-synced; deployment must be re-run after code changes.

## Manual acceptance checklist

- 320px, 360px, 412px widths; landscape and split-screen
- Android WebView tap targets, keyboard/viewport, scroll and back button
- Multiple pinch gestures, tab switch and return without zoom reset in the *actual app*
- Ride finish saving before earnings entry and recovery after interruption
- Single bike entry; odometer, part service history, edit/delete, and mileage calculations
- Time markers on/off, pause/resume, speed settings, clustering of stops when zoomed out
- RLS verification for share status, posted comments, earnings and maintenance
