# Rider Spot — URBAN FLOW v11 release record

Released (KST): 2026-11-21

## Scope actually implemented
- Replaced the black NIGHT SHIFT v10 theme with light warm-stone surfaces, blue operational accents, restrained coral alerts and editorial typography. This is a replacement, not an additional last-mile CSS overlay.
- `src/application.mjs`: moved the map layer/share tools into the same top command bar as location and weather; simplified the local community masthead.
- `src/Timeline.mjs`: route-first day view, with the ride summary/earnings component following the route map. The course and playback code remains unchanged.
- `src/finance-ui.mjs`: moved quick-entry and seven-day graph out of the balance hero into independent modules. The existing calculations, settlements, data models and modal editors are unchanged.
- `src/mobile-records.mjs`: replaced the maintenance 3x2 tile grid with a single-column status ledger ordered overdue/soon/normal, and changed garage headings. Preserved the same item details, maintenance editor, vehicle/model chooser, history, and bike graphics.
- `src/curated-v9.css`: completely replaced the old theme with URBAN FLOW v11 component styling (filename deliberately retained for existing builder mapping and immutable hashed URLs). Corrected bike image clipping on narrow screens.

## Verified artefacts
- Production immutable bundle hash: `78cfb498ffed`.
- Frozen Git commit: `1c4aca3dd488f8b5a97c6329f99c66e417ac7e3f`.
- New source PR: https://github.com/winzfs/riderapp/pull/25, merged in `54e564febe0406326512be66347adcb4f642e09d`.
- Local build/regression GitHub Actions: `44903663530`, SUCCESS.
- Isolated live preview acceptance: `44903863808`, SUCCESS; includes 320/393/412px navigation/scroll and page error test, synthetic income, expense, settlement and maintenance CRUD, native bridge, old immutable bundles and reload checks.
- Browser-rendered production post-deploy verification: v11 JS, CSS, native recovery guard, five tabs, no error page.
- Production Cloudflare Worker: `rider-spot`, version `f351645b-cb26-4d71-9866-8f6570b48b46`, deployment `9d65bd55-aace-4542-8f54-b5d4a58254bb`, 100%.
- Isolated preview: https://rider-spot-urban-flow-v11-preview.jazzhjm.workers.dev/

## Compatibility and rollback
- Previous known-good v10 Cloudflare Worker version: `a6a19bef-3939-4e30-bf2c-b65aafac2962`, deployment `fb148bea-866b-4c98-8d20-6c306fdc419f`. Restore that Worker version at 100% to roll back without modifying user data.
- Immutable old v4-v10 URLs are supported by `edge/urban-flow-v11-assets.mjs`.
- Native SQLite GPS and financial/maintenance persistence schema have not changed. The existing Android WebView receives updated web code; no APK reinstall is required solely for this UI change.
- Previous v10 auto-build workflow disabled on active branch; v11 build and safety checks registered for future updates.
- Actual on-device all-day ride, weak network, Android background GPS and split-screen tests are not equivalent to simulated browser/native-bridge acceptance; follow-up field testing remains recommended.
