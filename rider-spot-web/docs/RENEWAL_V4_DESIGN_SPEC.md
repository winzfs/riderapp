# Rider Spot — Native-first v4 UI renewal
Design/engineering acceptance spec · 2026-11-21

## Goal and source of truth
The goal is an integrated, premium, fast-to-scan 5-tab Android WebView experience, not another set of CSS-only cosmetic changes. Based on the user's seven screenshots of Map, Timeline, Community, Earnings, and My Bike, remove oversized empty surfaces, duplicate panel outlines, inconsistent spacing and button styles. Preserve live ride services, existing data, motorbike images and original neo-flat maintenance pictograms.

Primary mobile viewport: Samsung Galaxy S24+ (Android WebView), and browser/split-screen 320, 393, 412 px. All layouts must fit without horizontal scrolling, preserve thumb-sized interactive targets and respect system insets. Prefer neutral off-white surfaces, forest/teal brand accent and restrained orange status indications; no gratuitous illustrations.

## Information architecture

### Earnings / 수익
- Directly below Overview / Records / Settlements / Analysis navigation: period switch Today · Last 7 Days · Month.
- Replace tall gradient income banner with a white typographic 2-column summary: gross earnings dominant, work costs and cost-adjusted amount subordinate, date smaller.
- Keep Income entry and Expense entry as an adjacent primary/secondary action pair.
- Promote 7-day earnings graph above monthly goal so recent performance is visible without prolonged scrolling.
- Make charts touch-selectable without the heavy chart-selection outline. Selected bar color/label and the dated detail row convey selection; maintain focus-visible outline for keyboard accessibility.
- Compact monthly goal and platform comparisons. Keep all detailed records, payouts, analysis and all existing finance data contracts.

### My Bike / 내 바이크
- Vehicle and odometer header plus transparent model artwork stay together; put Odometer Entry and Model Selection buttons **inside** the vehicle surface instead of a detached extra row.
- Maintenance Add and Fuel Add remain one-tap actions directly below the vehicle.
- Keep three-column, six-component neo-flat pictogram cards; each shows part label and remaining km or overdue state; do not show configured cycle redundantly.
- List the three most recent maintenance records, with an explicit "N건 더 보기" control to expose **every** historical record. No data is deleted or hidden permanently.
- Retain per-part sheet, editing, deletion, model intervals, odometer synchronization and in-progress draft protection.

### Timeline / 타임라인
- Tighter weekday/date selector and summary; route map starts higher on screen.
- Non-full-screen daily route map reduced to approx. 290–365 px on mobile; full screen and map fit/zoom behavior must remain unchanged.
- Align route playback speed, seek, reset, markers/time/event switches in compact controls. Keep stamp visibility and route replay independent of map render lifecycle.
- Preserve workday boundary, GPS samples, current ride state, route-color gradients, and stop events.

### Community / 동네
- Flat feed inside a single surface, separated by gentle row rules rather than individual oversized rounded cards.
- Truncate previews to two readable lines, compact category tags and metadata, preserve image thumbnails and tap affordances.
- Retain district/dong filter, search, categories, article/news link behavior, new-post editor, likes, comments, and user draft preservation.
- No user-entered content, community safety prompts, login events, or file upload paths are removed.

### Map / 지도
- Keep immersive map itself as the dominant visual layer; slightly tighten the heading, filters, weather bar and ride-start action.
- Do not change Leaflet/MapLibre initialization, native location bridge, camera following/fitted extents, report pins, route geometry, live rider status, public toilet visibility or SOS routing.
- GPS controls remain discoverable and reachable with one hand.

## Shared design foundation
- Consistent 12–18px interactive radii, 16px horizontal page margins on phones, and 44px or larger primary touch targets.
- Numbers and dates use tabular numerals; labels use a strong information hierarchy instead of noisy card boundaries.
- Preserve reduced-motion settings, keyboard focus-visible indicators and screen-reader names.
- Maintain bottom sheet drag/back/escape handling and input draft persistence.
- Shared CSS is baked into hashed Web assets after old premium-shell.css; old style rules cannot silently override v4. A separate visual Worker is the final CSS layer only.

## Source files
- Actual React screen structure: `src/finance-ui.mjs`, `src/mobile-records.mjs`, `src/Timeline.mjs`, `src/application.mjs`.
- Layout system: `src/renewal-layout.css`, `src/visual-v2.css`, `edge/visual-v2-worker.mjs`.
- Hashed asset packaging and pre-cache: `scripts/build.mjs`.
- Build unit and mobile record flow acceptance: `rider-spot-renewal-v4-release.yml`.
- Isolated KV/static/cloud preview test: `rider-spot-renewal-v4-preview.yml`.

## Invariants, smoke checks, release gates
1. All JS/React/runtime build tests pass; the v4 hashed app bundle references the new layout classes.
2. Safety-gate asserts no automatic completed-ride revival, GPS event listener regression, map camera jump, WebView recreation on Resume or forced PWA reload.
3. Logged-in mock fixture browser checks finance forms, bike odometer edits, maintenance CRUD and Back navigation including the new collapsed history button.
4. On isolated Cloudflare preview, every new hashed asset and Service Worker returns HTTP 200; HTML retains v217 native recovery guard and immutable v4 layout CSS.
5. Real preview browser 320/393/412px passes 5-tab navigation, no horizontal overflow, no unexpected document reload and no JavaScript page error.
6. Only then promote the **same** front/asset/design versions at 100% to the live production Worker; never an unsafe 1%/99% cross-version split.
7. Live smoke repeats preview gates. Existing v3 front and design Worker versions must remain available for instant rollback.

### Never touch for a design-only release
Production Supabase tables/policies, Android SQLite, existing user records, profile images, maintenance logs and costs, remote APIs, GPS watcher logic, Leaflet/MapLibre camera lifecycle, OAuth nonce callback, WebView bridge / service lifecycle, old hashed files, or original v220 failover.

### Physical acceptance still required
Authenticated personal-account create/update/read/delete against a disposable record, Android 17 Galaxy long-session GPS and SQLite after screen lock, native Google login, and split-screen/landscape. Automated browser/emulator checks are not a substitute for these real-device verifications.
