# Rider Spot update safety policy (v1.0.12 recovery-loop baseline)

This is a deployment policy, **not app runtime code**. Do not change the UI,
GPS capture, timeline, finance, maintenance, rider sharing, weather or data
storage solely to satisfy this policy.

## Invariants (required on EVERY update)

- A *completed* trip must never be restored as an active recording. Native
  `lastStoppedId` can remain after completion; it is not permission to restart.
- React/WebView/native bridge must never reload the document automatically to
  complete a trip or retry synchronization.
- Native GPS samples and completed trip history must survive authentication
  changes, offline mode, app restart and temporary network errors.
- The main map must keep user-selected zoom/center when GPS refreshes or the
  Android viewport changes. Explicit "my location" remains usable.
- The current service worker must not call `skipWaiting()` or
  `clients.claim()` to replace a working session mid-delivery.
- APK updates preserve the already working Android split-screen/WebView
  configuration guards.

## Required release process

1. **Keep production unchanged.** Work only on a candidate commit. Record
   previous Cloudflare Worker deployment/version ID, compiled asset hash and
   APK version before starting.
2. **Run the read-only regression gate**: GitHub Actions ->
   `Rider Spot update regression safety gate`. It runs existing web unit
   tests and Android native tests, builds web output, and checks the *real*
   archived APK bridge plus web release files.
3. **Only stage artifacts after the gate passes.** The existing
   `Rider Spot Web Checks` staging job now executes the same gate before
   writing into `prebuilt/`. No release should promote an untested bundle.
4. **Preview, then promote.** Test in a nonproduction deployment and with a
   side-by-side APK, including repeated launches, Back/navigation, GPS
   start/stop, switching tabs, weather updates, background/foreground,
   60+ seconds idle, lock/unlock and Samsung split-screen resize.
5. **Compare exact versions.** Record the SHA of the tested candidate, the
   actual deployed asset hash and the APK version. Verify production serves the
   same artifacts. Reject mismatches.
6. **If any gate fails, DO NOT DEPLOY.** Preserve production and investigate
   the specific failure. Never delete user app data or overwrite native
   SQLite records as a workaround. For a bad Worker release, roll back the
   Worker only; this does not undo a user's local database.

## Important enforcement limitation

A GitHub Actions job **cannot** prevent a Cloudflare deployment performed
directly by API, console or a different release workflow. To make this a
mandatory barrier, protect the deployment branch with a required passing
`regression-gate` status check, and route **every** Worker/APK production
promotion through a workflow that depends on this check for the *same commit*.
Disable or restrict legacy direct-publish paths. Until then, treat this gate
as a hard team release policy, not guaranteed platform enforcement.

## Scope of changes for the initial guard

Only CI and safety tooling changed:
- `rider-spot-web/scripts/check-update-safety.mjs`
- `.github/workflows/rider-spot-update-safety-gate.yml`
- the read-only pre-staging step in `.github/workflows/rider-spot-web-checks.yml`
- this document

No app-facing assets are intentionally modified by this safety policy.

If a test fails on an existing implementation, that is **not** permission to
silence the test or automatically patch the app. Confirm a deliberate,
reviewed fix first; preserve the currently working production version.
