# Rider Spot Android · income integration beta v1.0.14

- Base: existing RiderSpot Android GPS/WebView native source archive (`rider-spot-android/source.tar.xz`).
- Build script: `income-integration/patch-native-income.py` injects Android accessibility service and trusted-origin JS bridge; does not change existing source archive.
- Source of classifier: exact v0.7 detection core (`AmountAnalyzer`, `NodeContextProbe`, `FeeComponentParser`, `IncomePrototypeClassifier`, `PrototypeCaptureGate`, `IncomePrototypeStore`).
- Only authorized RiderSpot WebView origin may invoke `income-status`, `income-enable`, `income-records`, `income-ack`, `income-settings` through `RiderSpotHost`. Opt-in, account binding and enabled Accessibility permission are required.
- Separate on-device candidate ledger stays available offline and syncs after reopening the app and when logged in. Server API uses an idempotent `(user_id,capture_id)` key. The local service does not transmit customer names, addresses, screen text, or order identifiers.
- The earnings screen receives a per-delivery native-owned card listing the last 25 auto-captured deliveries and their fee components. Automatic strong candidates can be applied on the server; if preexisting manually entered earnings are present for that platform/day, records are `needs_review` and do not add to daily totals until explicitly resolved.
- Timeline does **not** show per-delivery records; the existing day income control reads `rider_earnings` aggregated per KST 03:00 workday. The bridge adds a lightweight current-day sum below that control only when current-day timeline is displayed.
- Google OAuth, native GPS, stop detection, recap export, navigation, WebView lifecycle and screen design remain handled by the original Android bridge and website.
- The workflow produces both original-package APK and a side-by-side test APK. The latter has isolated storage/auth callback and may not support Google login. Existing debug install signatures may differ: back up or sync offline trips before changing installs.
- Repository migration: `supabase/migrations/202611220002_rider_auto_income_ledger.sql` (applied to the connected RiderSpot Supabase database).
- Unresolved production issues: no official order id is available; consecutive equal-fee deliveries can be deduplicated, or old completion screens may be recognized later. Real device verification, settlement reconciliation, complete missed-delivery rate, and external distribution/accessibility disclosures remain necessary. This is a beta, not a financial authority.
