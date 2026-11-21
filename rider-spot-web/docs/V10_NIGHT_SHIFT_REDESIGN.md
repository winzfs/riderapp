# Rider Spot v10 — NIGHT SHIFT / Functional redesign contract

Status: design and implementation baseline (not a production release)
Base: feature/rider-spot-native-apk @ ce2afe0f5d2ba3c8c15faded7805d342ab0ec949
Production at review: v8 7ba6f9cb1359, deployment f56dc99e-6705-4695-828b-774836557061
Unreleased: curated v9 preview, hash a42623dd9d1b

## Why a new concept is necessary
The current muted cream / dark green / mint language is visually consistent in color but structurally inconsistent:
- Map: weather, GPS, tool affordances, sharing, SOS, report controls, journey CTA and navigation compete for attention.
- Timeline: map, trip stats, event toolbar, event list and ride controls appear as separate generic cards.
- Community: excessive empty space between the region header, filter and feed; article grouping lacks editorial hierarchy.
- Finance: four sub-tabs use different information density. Monthly analysis separates headline, KPIs, graph and expense ledger into disjoint visual blocks; graph selection outline looks browser-native.
- Garage: bike photo, odometer, maintenance actions, urgency alerts, 3x2 consumable grid and history do not form a coherent maintenance workflow.
- Cross-cutting: too many white cards, mixed outline radii, inconsistent horizontal rhythm and suboptimal split-screen layout.

## Identity: NIGHT SHIFT
A rider-first cockpit, not a financial dashboard website. High-contrast ink (#13191B), warm off-white (#F5F4EE), electric citrus (#D6F052) and restrained hazard orange (#FF8D59). Use **light content surfaces as the default**, ink only for primary operational modules and dark map overlays; avoid an all-dark app that impairs daytime visibility. Typography: compact utility labels, substantial numbers, editorial headlines; avoid decorative all-caps labels. Keep emergency features always distinguishable in red. Distinguish actions by shape and position, not merely hue.

## App frame
One consistent top status/header height. One 5-item bottom navigation, actual semantic current tab, minimum 44px target. Use a dedicated operational status strip when a ride is active. Full bleed map on map and timeline screens. Sheets for filter, input, history and settings; do not cover ride stop/resume controls.
No sideways horizontal overflow at 320px, 360px, 393px, 412px and Android split-screen.
Use 8px baseline with 16–20px screen margins; no extra full-height dead space on empty tabs.
Accessible high-contrast focus styles on keyboard; never render a thick permanent border on chart clicks.

## Screen architecture
### Map
1. Map canvas is dominant; show compact location/weather pill as one unit.
2. GPS / zoom / tools share one unobtrusive rail.
3. Expose toilets and incident reporting through one map sheet, share setting as explicit toggle.
4. Bottom active-ride dock: elapsed time, distance, ride state and single primary action; SOS separate and readily reachable.
5. GPS camera must never recenter after initial mount merely because route/map data changed.
### Timeline
1. Date, ride status and mini stats integrated into one top control.
2. Route remains visually dominant; full-course default only on history map.
3. Time and event chips shown in a single expandable control; scrollable chronological event list below map.
4. Ride pause/resume/finish remain persistent, no accidental stop due to layout movement.
### Community
1. Tight location masthead with compose action.
2. Search/filter sheet invoked from one small affordance.
3. Row-first feed: category / subject / excerpt / meta; optional 64–88px thumbnail.
4. No unnecessary cards around every article, no fake data or decorative icons.
### Finance
1. One shared month/day range header across four subtabs.
2. Overview presents income, work cost, net as a single financial statement. Chart joins same module; income and expense actions remain next to summary.
3. Ledger: filter summary + chronological transactions, group by day, edit/delete in an accessible action sheet.
4. Settlement: collected vs uncollected clearly differentiated; retain platform payout rules, actual paid dates and mismatch warnings.
5. Analysis: monthly total + three small metrics + chart + costs. Chart selection uses a subtle bar/bubble state, not an outline rectangle.
6. No change to finance data contracts, normalized platform fields, Korean workday cutoff or persistence.
### Garage
1. Odometer and bike art share one hero with clear odometer edit affordance.
2. Urgent replacement items appear in a ranked warning rail directly beneath hero, not as arbitrary badges.
3. 3x2 maintenance grid aligns custom pictograms and the remaining distance; card taps open the same part detail sheet with cycle editing and history.
4. Maintenance and fuel quick log near hero, reachable with one tap.
5. History as editorial timeline, not another card pile.
6. Bike model presets remain editable; prior replacement mileage correctly determines remaining distance.

## Functional invariants (strict)
- Preserve native SQLite ride GPS bridge, Supabase/auth flows, sync queue, 03:00 business-day boundary and stored rides.
- Preserve camera persistence and keep map mounting independent from weather/status polling.
- No location share without consent; no exposing private GPS publicly by default.
- Keep v4–v9 immutable asset URLs available to already-open Android WebViews.
- Preserve service worker refresh guard, Android back behavior, sheet gestures, 2-tap app exit and no tab bounce.
- Preserve all maintenance records, recorded odometer values, payouts, income and expense records, recurring expenses, community posts.
- Engine migration (React, Leaflet, Workers) is NOT justified without a measured bottleneck and complete migration tests; prefer restructuring JSX/CSS first.

## Release acceptance (must pass before production)
1. npm ci; npm test; npm run build.
2. React DOM and screenshot checks for all five tabs and finance's four subtabs on 320/360/393/412px.
3. Synthetic create/edit/delete for maintenance, income, expense; confirm paid/unpaid settlement and monthly aggregates.
4. Android WebView native bridge and resumed ride, GPS pause/stop, map zoom/pan, background/foreground, and service-worker refresh regression.
5. Screenshot diff against current production plus manual full-screen & split-screen audit. A release fails when the same page structure merely has different colors/radii.
6. Verify all previous immutable bundle URLs 200 in isolated preview.
7. Promote only after passing preview and record explicit deployed version and rollback version.
