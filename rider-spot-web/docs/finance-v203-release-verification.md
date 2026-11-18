# Rider Spot Finance v203 — release and verification

Deployed Worker: `rider-spot`, active v203 (Cloudflare version `41ec1416-96c8-46be-af82-f04141774880`)
Release hash: `9ffd5433f0b3`
Production URL: https://rider-spot.jazzhjm.workers.dev/
Rollback baseline: v202 (`922a9c6d-df74-45cc-baca-bef852d04ecc`).
Validated distributable: `rider-spot-web/prebuilt-v203/`.

## Delivered changes

- A **single transaction-safe income writer** for timeline and finance tabs:
  `src/finance-storage.mjs` using `rs_save_daily_income_guarded` and
  `rs_save_income_with_components`. Stale totals or row revisions return
  visible conflict messages rather than silently overwriting records.
- Uses the existing user-owned original rider, maintenance and fuel tables:
  no duplicate finance copies of service or fuel costs.
- Optional promotion and tip fields are **included in**, not added to,
  gross income. Database constraints prevent their sum exceeding gross.
- Earnings vs actual payout are not conflated. Recurring cost projections
  are never booked until confirmed, with a monthly uniqueness guarantee.
- Adds searchable/category-filtered expense ledger, 10s delete undo,
  compact numeric sheets, draft restoration and account-scoped cached money.
- Sharp touch-selectable SVG income charts and weekly/monthly analysis.
- Ride efficiency is explicitly unavailable when income days lack usable GPS
  mileage/time records; incomplete coverage never shows precision as fact.
- KST day rules: rider business day rolls over 03:00, fuel/payout calendar
  day rolls over 00:00.
- Existing map data, OAuth, maintenance icons and historic assets retained.

## Automated verification

- `Rider Spot Web Checks` (node tests and build): successful at commit
  `49f3bc8ee56a07b2c090102cad1dcbc1e97f3f5e`;
  https://github.com/winzfs/riderapp/actions/runs/44416404165
- `Rider Spot finance integration & verified build` (mobile Chromium
  UI flow, financial records, bike and timeline regressions): successful;
  https://github.com/winzfs/riderapp/actions/runs/44416404153
- `v203 isolated verified build`: passed;
  https://github.com/winzfs/riderapp/actions/runs/44416871538
- `v203 preview exact-file comparison`: passed;
  https://github.com/winzfs/riderapp/actions/runs/44417181948
- `v203 production exact-file comparison`: passed;
  https://github.com/winzfs/riderapp/actions/runs/44417405652
- Responsive Chromium cases include 320x700, 360x400, 412x892,
  430x930 with Android WebView-like UA, and 700x360 landscape.
- Supabase verification: new finance RPCs are security-invoker,
  RLS is preserved, zero duplicate groups in rider income at check time.
- Server migrations are stored in `supabase/migrations/202611190002` through
  `202611190005`; release is not dependent on client cache.

## Actual-device acceptance checks (requires a physical Android device)

The automated checks validate rendered Chromium behavior and HTML/CSS
dimensions but **cannot validate actual S24+ Android WebView behavior**.

- [ ] S24+ WebView normal portrait: save, edit, delete and undo income.
- [ ] Split-screen keyboard: scroll to last finance field, confirm save
  button is never obscured.
- [ ] Background app switch / resume and transient network loss during a
  draft edit; no accidental duplicate submission.
- [ ] Native Back button / gesture while bottom sheet and nested modal open.
- [ ] Pinch / landscape / small window layout, exact icon crispness.
- [ ] Two signed-in devices editing the same dated income: user sees
  conflict, refreshes and resolves, without losing the other update.
- [ ] Existing deployed APK loads the current Worker bundle and new DB RPCs.

These are explicit human/physical checks, **not** claims of completion.

## Known boundaries

- Production bank transfers are not connected; payout is manual.
- Financial cost categorization in historical `legacy_unknown` rows remains
  flagged. No automatic classification or destructive migration.
- No tax/legal verification or financial-industry certification is implied.
- Supabase security advisor notes unrelated to finance release:
  `poi_import_control` is an RLS-restricted table without a policy,
  and leaked-password protection is disabled. The finance feature did not
  change those unrelated settings.
