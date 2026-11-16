# Rider Spot GPS v42 — Native session ID collision recovery

**Production Worker deployment:** 2026-11-16T13:58:02Z.

## Symptoms

Android v1.0.6 alerts `백그라운드 GPS 시작 실패 · 다른 운행이 기록 중이거나 운행 ID가 잘못되었습니다` after the web UI shows `운행 기록 중`.

## Root cause

`TrackStore.startTrip(id)` refuses a new trip while `active_trip` contains another UUID. The web React hook can create a fresh UUID after login/reload while the Android foreground service still owns and records the earlier trip. The v41 native SQLite poller only handled a matching ID and left this conflict unresolved.

## Changes

- When starting a new trip, the React hook first checks Android `state` via `__rsGPS42PreflightStart()`. If a native trip already exists it **does not** create a duplicate web trip.
- On a detected ID mismatch, display `기존 운행 복구하고 이어서 기록` on timeline. The user must explicitly press it to adopt the old SQLite trip.
- The recovery action loads original native GPS points and start time (on-device), stores any conflicting web-only record under a separate local rescue key, writes `rs:active:<user_id>`, and reloads for the existing app's recovery flow.
- Do not call native stop, clear SQLite, or upload GPS while recording. No database migrations.
- The existing v41 SQLite replay, recording notification, 60-second stops, Google OAuth handler, and road-matching remain intact.
- Deploy only against a Worker containing both OAuth and road-matching handlers; smoke tests fail otherwise.

## Files

- `rider-gps-recovery-v42.js`: external web client recovery script.
- `rider-gps-recovery-v42.test.cjs`: Node VM tests; run `node --test rider-gps-recovery-v42.test.cjs`.
- `deploy-rider-gps-v42.js`: Worker multipart patch for the already-configured script.

Live changes are delivered by Worker; no new APK is required for this mitigation. Samsung real-device foreground recording and cross-login edge cases are not yet verified.