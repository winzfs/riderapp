# RiderSpot GPS sync v47 — device-first incremental cloud backup

## Production behavior (2026-11-23)

* **Source of truth:** Android `TrackingService` SQLite GPS rows (`seq`, `t`, `lat`, `lng` plus metadata). The page does not clear or edit that source.
* **Cloud checkpoint:** signed-in rider's private `rider_trip_checkpoints` rows. A five-minute cadence checks for new samples, with up to four 120-point batches per wake (480 maximum).
* **Bandwidth:** only rows after the latest cloud-acknowledged `last_seq` are uploaded. Server cursor is queried again on retries; overlapping uploads are suppressed by unique `(user_id, trip_id, first_seq)` and APK fallback detection.
* **Data fidelity:** no snapping, rounding, path interpolation, arbitrary downsampling or route segmentation. Unknown/invalid ordering fails closed rather than silently advancing a cursor.
* **Offline recovery:** native SQLite remains intact when internet or Supabase is unavailable. On foreground return or network recovery, pending points are sent starting at the cloud cursor. A short backoff prevents tight retry loops.
* **Users without login:** local recording works; private Supabase synchronization does **not** run for guests. An authenticated session must belong to the active trip.
* **Already integrated APK:** the separate native-income/checkpoint build exports `window.__rsTripCheckpointStatus`. This web fallback detects it and avoids a second uploader.
* **Finalization:** the existing complete-trip write to `trips` is unchanged; the database's existing completion trigger removes temporary checkpoints only after a successful completed-trip insert/update. The final route/renderer are unchanged.
* **Schema guard:** `rs_checkpoint_payload_v47` enforces a 120-point / 64-KiB-per-batch ceiling, protecting the shared server from unexpectedly large payloads.

## Current limitations and follow-ups

* JS timers in Android WebView can be suspended when the app is fully backgrounded. **Do not claim guaranteed five-minute background transmission.** Native Android foreground-service uploader with secure owner-scoped authentication and a durable outbox requires an APK release and phone testing.
* Finalizing as an unauthenticated guest can still exhaust legacy WebView `localStorage` if the entire completed route is copied there. Separate IndexedDB/SQLite-backed lazy route history is required before removing existing history writes. Never delete raw GPS or uninstall a user's existing APK to make room.
* The existing `trips.select("*").limit(50)` downloads complete routes for the timeline list. A server metadata index and lazy on-demand route fetch will reduce repeated client downloads, but require coordinated frontend changes and fidelity tests.
* There is not yet a representative 100/1,000/5,000-user load test. Scale readiness must be measured, not assumed.

## Deployment and verification

Web: `rider-spot-web/src/trip-checkpoint-web-fallback-v47.js` via live Worker `/rider-spot-trip-checkpoint-web-v47.js`; source tests `rider-spot-web/tests/trip-checkpoint-web-v47.test.mjs`.

DB migration: `supabase/migrations/202611230002_checkpoint_payload_limits.sql`. Existing 3,611 checkpoint points across 38 rows remain untouched. 

Release rules: do not modify native SQLite sample retention; do not delete unsynced or guest records; never replace authenticated RLS with public GPS data access; never change GPS points in `trips` without explicit migration + per-route regression QA.
