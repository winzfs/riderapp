# Rider Spot — SIGNAL HUD v205

## Production release
- Worker: `rider-spot` at https://rider-spot.jazzhjm.workers.dev/
- Active version: `b35815bf-c1d5-4998-8646-0b050bf7a4a4` (100% rollout)
- Immutable asset hash: `efe99d2ccbd0`
- Tested release directory: `rider-spot-web/prebuilt-v205/`
- Rollback version: v204 `9d507131-90de-4997-bf2b-5236c7db76fa`

## Design principles
- Modern, quiet UI, not a decorated game screenshot
- Teal `#25CCBE` = active and healthy; deep teal for readable labels
- Orange `#FF893B` = prominent action, earnings and progression
- Mist `#F5FBFA` = background; ink `#173D43` = text
- Preserve Korean short action labels for critical ride, saving and deleting actions
- Preserve original maintenance pictogram sprites, real geographic basemaps and data
- Use micro interactions with reduced-motion support, not distracting motion while riding

## Changes
- Map: shorter GPS/private/share status pills, bright teal state and locate controls
- Timeline: shorter map toolbar labels and riding summaries, more prominent distance HUD
- Community: tighter title/body and metadata, compact categories and orange author action
- Earnings: short overview cards, brighter teal hero and orange income action, high-contrast chart and progress bars
- My Bike: abbreviated service labels and part-specific button; long maintenance safety text available in an expandable details control, never removed
- Rider progress: shorter level/XP and recap labels and clean teal progress/Orange award accents
- Shared bottom navigation: highlighted active icon with small Orange signal mark

## Automated checks
- Source build + unit tests: GitHub Actions "Rider Spot Web Checks" successful
- Five-tab bike/timeline/finance UI flow: "Rider Spot finance integration & verified build" successful
- Isolated v205 release: https://github.com/winzfs/riderapp/actions/runs/44452922621
- Cloudflare preview verified: https://github.com/winzfs/riderapp/actions/runs/44453251342
- Cloudflare production verified: https://github.com/winzfs/riderapp/actions/runs/44453479585
- Worker preserves previous v204 app assets, map manifest and previous routes

## Final device acceptance
Production and browser smoke do not replace physical Android S24+ testing:
- [ ] Confirm active tabs and bright accents in physical S24+ WebView
- [ ] Keyboard and split-screen correctly resize earnings and service sheets
- [ ] Hardware Back remains stable in nested timelines, edits and dialogs
- [ ] GPS/sharing status still reflects actual permissions and connection
- [ ] Maintenance sprite artwork remains crisp on a high-DPI device
- [ ] Overlay and readable contrast at outdoor brightness

No data schemas or user records were modified for this visual release.
