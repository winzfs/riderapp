# Rider Spot Ride Recap — Production Release (2026-11-21)

## Production
Cloudflare Worker rider-spot uses production version 7500f8ad-b541-4dd0-afe4-e36275d0ebfb at 100%.
Asset Worker rider-spot-recap-v2-assets serves immutable release 7b68a77eb20f.
Existing DESIGN and LEGACY service bindings were preserved.
Earlier asset releases 11cf61e8a1ba and 78cfb498ffed remain routable.
Safe rollback Worker version: 2e114d25-64c8-4fff-a42d-79366d380be5.
Deployment id: 8c1a7664-303a-4f25-89ef-63c15bf78896.

## Functionality
Three image export modes: GPS ride trace, daily settlement, all-in-one.
Three PNG sizes: 1080x1350, 1080x1920 and 1080x1080.
Independent GPS and finance privacy toggles, three editorial color themes.
Read-only finance day lookup and existing 03:00 Korea workday rule.
No fake connectors across GPS gaps or trips; exported route is vector-only, not copyrighted map tiles.

## Tests
Web Checks 44911875018: successful.
PNG Chromium and live preview HTTP 44912110371: successful.
Native Java build, GPS bridge tests and APK artifacts 44912020571: successful.
Production browser verified current hash, five tabs and Android recovery guard.
Device-level verification of the new APK's gallery output is still pending.

## Native APK caution
The older installed WebView APK cannot reliably download blob URLs; it has no image save bridge.
The new client reports that an APK upgrade is needed instead of falsely reporting success.
A new optional Android build adds a trusted-origin recap-save WebMessage action, validates PNG bytes,
and stores it through Android 10+ MediaStore in Pictures/RiderSpot.
The Android build provides both an original package and a side-by-side .recap test package.
The side-by-side package preserves the existing installation but has separate local data.
The original-package debug APK may not be installable as an update if signatures differ.
Never delete or uninstall the installed APK when unsynced GPS rides may remain.

APK artifact run: https://github.com/winzfs/riderapp/actions/runs/44912020571

## Rollback
Deploy Worker rider-spot version 2e114d25-64c8-4fff-a42d-79366d380be5 at 100% via Cloudflare
with no Supabase, GPS, Android or legacy API changes. Confirm shell and tab navigation after revert.
