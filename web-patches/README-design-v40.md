# Rider Spot v40 — UI and maintenance defaults

Cloudflare Worker live deployment on 2026-11-16T13:08:20Z.

- New mint/teal + orange UI, header/bottom tabs mobile safe-area adjustments.
- APK WebView detection through `/rider-spot-shell-v40.js`, added as an external first-party script to comply with existing CSP.
- Maintenance example values for PCX/scooter wear parts: engine oil 6,000km, air filter 18,000km, drive belt 24,000km, spark plug 12,000km; wear-dependent parts have example cost only.
- Example prices are editable, *not actual maintenance expenses*, and do not create Supabase records until the user chooses Save.
- Existing Google OAuth and map-matching Worker handlers must be preserved when deploying.
- Files `rider-spot-design-v40.css` and `deploy-rider-spot-v40.js` contain the applied UI stylesheet and verified deployment migration.
- WebView safe-area and display behavior should be checked on Android 15+ real hardware.
