# RiderSpot / My Year v4 — ANNUAL ARCHIVE
Release: 2026-11-23 · Production Worker: `rider-spot`

## Design rationale
Previous Quiet Grid v2/v3 contained 12 visually repetitive mini calendar widgets. Removing the cards did not produce the desired contemporary-art look. The new layout uses one contiguous **12 × 31 data composition** to present the year as a single visual artifact. Data cells reflect actual persisted records only; no decorative/artificial activity.
- Warm chalk paper (`#F9F8F5`) + charcoal ink (`#202B31`) with a single cobalt-blue scale (`#BCCCE4`, `#7795CD`, `#3559AC`).
- Oversized sculptural year typography, a quiet title, an asymmetrical numeric earnings and workday composition, thin dividers, minimal controls.
- One horizontal row per month. Column position is day of month 01–31, not weekday. Missing end-of-month dates are fully transparent. Year 2026 produces 372 cells across 12 rows, with only genuine activity cells tinted.
- Entire month row remains clickable to open the preserved detailed month calendar.
- The toggle for '근무 기록' and '수익 구간', year selector and detailed records remain functional.
- No scenery, leaves, characters, gradients or decorative cards.

## Source and deployment
- `src/year-calendar-bridge.js`: version 4.0, latest artwork view, original data aggregations, native-income fold add-on unchanged.
- `src/year-calendar-art-v2.css`: appended v4 poster overrides scoped to `.rs-year-dialog`.
- `src/auto-income-disclosure-v1.js`: untouched folding function (bundled inside bridge).
- `edge/rider-spot-gateway-my-year-v4-gallery-live.mjs`: exact production Worker source.
- CDN pinned to commit `d709af1b5c4cf8ba82e0fb553f162a46c7b11d94` at `https://cdn.jsdelivr.net/gh/winzfs/riderapp@d709af1b5c4cf8ba82e0fb553f162a46c7b11d94/rider-spot-web/src/year-calendar-bridge.js`.
- `rider-spot` Worker root HTML loads `/rider-spot-my-year-v4.js`. Historical v1/v2/v3 scripts/routes remain available for older sessions and rollback. V4 route falls back to pinned v3 if the new asset fails; original v1 remains a last-resort fallback.
- Production bindings `ASSETS`, `DESIGN` and `LEGACY` preserved, original app bundle hash, recovery guard and OAuth logic unchanged.
- Test Worker `rider-spot-urban-preview` returned to original code and bindings.

## Validation
- Core annual data reader and native-income disclosure module identical between v3 and v4.
- JS syntax checked.
- Browser Rendering at Android-like 390px viewport: 2026 numeral/title do not overlap; full 12 month rows and 372 date cells render. Synthetic records for Nov 20 and 22 produced 2 tinted days, workdays 02 and income 180,000 won. Layout bounding box: full matrix approx 352px wide.
- Operating server root was confirmed loading the v4 resource, while old application hash and recovery guard remain intact.
- Operating server v4 JS serves the calendar artwork and native-income disclosure modules.
- Real-user Android WebView visual QA is still required to verify actual device font scaling and spacing. No real user's earnings were accessed.

## Rollback
Use `edge/rider-spot-gateway-my-year-v3-income-fold-live.mjs` or `edge/backups/rider-spot-prod-v2-before-my-year-fix-20261123.mjs` with original service bindings. Repeated deployments should preserve the additive script routes and income disclosure.
