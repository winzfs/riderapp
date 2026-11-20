# Rider Spot — physical Android release acceptance (pending operator execution)

**Current status (2026-11-20):** The split Worker was promoted to
production as version `f764543b-35c5-48a7-9b4e-3b2b76b07b3c` after
successful browser, API, OAuth nonce and emulator acceptance. **Real phone
GPS/SQLite and real-account OAuth/CRUD are still unverified**, so the items
below are required post-release field acceptance, not completed tests.
Rollback Worker v220 remains available as
`44fe53dc-b7a4-4d98-af36-79a8b3dbddc8`.
See `docs/PRODUCTION_RELEASE_RUNBOOK.md`.

## Verified automatically

- Isolated front `rider-spot-static-preview` and the 13.8KB
  `rider-spot-api-core-qa` are connected and tested.
- Unit tests: 22/22 passed; real HTTP parity, including synthetic native OAuth
  callback and cookie invalidation: 16/16 passed.
- Anonymous Chromium, 320 / 393 / 412px: five tabs, no horizontal overflow,
  no spontaneous document reload, no JavaScript page error.
- Finance and maintenance UI accepted with mocked, **non-production** signed-in
  test fixtures.
- Android emulator first launch/relaunch is automated separately.
- Supabase exposed public tables have RLS enabled and primary owner-owned
  records use `auth.uid() = user_id` policy checks.
- Direct Workers Static Assets upload under the current connector returned
  HTTP **401**; KV-backed preview remains active.

## Physical Galaxy/Android acceptance (not yet completed)

This test **cannot be performed by a cloud browser or emulator**. Use the
separate package `com.riderspot.android.migrationqa`. It is distinguishable
from the production app and has **Google sign-in intentionally disabled**,
so it cannot validate the end-to-end Google login callback.

- [ ] Before starting, check that the installed production Rider Spot app
  opens and that its previous trips, income and maintenance records remain
  visible. Do not uninstall the production app.
- [ ] Install the separate QA APK with a different app ID. Verify that both
  app icons exist and the original app still opens.
- [ ] QA app opens to a modern map, shows all five bottom tabs and does not
  spontaneously navigate/reload during five minutes of normal use.
- [ ] Open each tab and return to map. Pinch map, pan, switch between apps,
  rotate or enter Samsung split-screen, then return. The map should retain
  the selected position/zoom unless an explicit recenter was requested.
- [ ] In a safe stationary location, start an isolated test ride, lock the
  screen and allow location collection. Do not use a test app for live
  deliveries or interact with it while riding.
- [ ] Return to app, stop the test ride, verify it remains stopped after
  app backgrounding and relaunch. It must **never** flash back to
  `기록 중` or resurrect the completed ride.
- [ ] Confirm the QA ride's distance and timeline are consistent with the
  actual recorded test path. Do not assume an emulator fake GPS proves
  real-device GNSS or Android battery-management behavior.
- [ ] Check the production app one more time. Existing records and login
  should be unchanged; the QA APK has its own local files/database.

## Remaining field checks and optional hosting improvement

1. **Native Workers Static Assets:** authenticated asset upload returns 401
   with this connector. Reconnect the Cloudflare integration or authorize a
   suitable Workers Scripts Write token in a secure Wrangler/CI environment,
   then retry official upload **on a staging Worker only**.
2. **Authenticated read/write:** synthetic fixture tests are insufficient.
   With a consenting disposable account, validate full
   save/readback/edit/delete and RLS isolation for test-only earnings,
   maintenance records and a trip. Never modify an existing rider's records.
3. **Real Google OAuth end-to-end:** the isolated APK intentionally blocks
   external Google login to prevent intercepting production OAuth. This
   needs a separate, supervised first-party-origin test.
4. **Post-release and rollback:** after field checks, compare prior app state,
   older asset URLs and Service Worker cache transitions. If a critical issue
   appears, revert using the preserved v220 Worker deployment; never clear
   phone SQLite or Supabase rows as part of rollback.

## Pass/fail and evidence

Record date, app build, Android version, initial state, exact steps and result
for every manual test, excluding GPS coordinates, passwords and tokens.
Any regression, missing record, repeated full reload or OAuth failure after
release calls for immediate assessment and possible rollback to v220. Fix and
retest on the isolated staging branch before the next production promotion.

## Latest automated emulator result

[Run 44698813634](https://github.com/winzfs/riderapp/actions/runs/44698813634)
passed for the new API core, with staging WebView CDP confirming the correct
hostname, five tabs, map and ride-start control on first launch and relaunch.
The initial emulator DNS error recovered on retry; this remains a limitation
of hosted test-network conditions. Physical GPS, lock-screen persistence
and genuine user OAuth are still **not** verified.
