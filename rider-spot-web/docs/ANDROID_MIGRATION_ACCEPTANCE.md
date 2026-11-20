# Rider Spot — physical Android release acceptance (pending operator execution)

**Scope:** A production cutover is NOT approved by emulator tests alone. The
original Rider Spot v220 at `https://rider-spot.jazzhjm.workers.dev/`
must remain deployed until each gate has evidence. Its known rollback
version is `44fe53dc-b7a4-4d98-af36-79a8b3dbddc8`.

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

## Still blocked / separate acceptance

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
4. **Deploy/rollback:** verify old version assets and Service Worker cache
   transition, then test a reversible production Worker version release
   **only after** all gates above pass.

## Pass/fail and evidence

Record date, app build, Android version, initial state, exact steps and result
for every manual test, excluding GPS coordinates, passwords and tokens.
Any regression, missing record, repeated full reload or OAuth failure blocks
production promotion and should be fixed in the isolated staging branch first.
