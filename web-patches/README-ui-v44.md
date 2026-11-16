# Rider Spot UI v44 · 2026-11-16

Production Cloudflare Worker updated to present compact, consistent mint/teal and orange UI.

Changes:
- The active-trip banner is no longer absolute-positioned over Community search. The redundant banner in Map and Work is removed.
- Trip events use an accessible React-controlled disclosure with item count. It starts collapsed and remembers its open state in localStorage.
- Timeline: condensed map actions, clear status and distance cards, refined button hierarchy.
- Map: compact filter chips and position/share controls; SOS and GPS status remain present.
- Work: repaired narrow recording card and consolidated quick tools.
- Community: search/filter/card spacing refined.
- Original sqlite GPS, ride data, Google OAuth, road matching, maintenance, routes, and database storage unchanged.

Safety: these changes were applied to live Worker assets; no APK uninstall or reinstall is required. Production verification performed: Worker upload accepted, re-fetched code checks successful. An independent Android visual end-to-end test has **not** yet been performed.

Files:
- rider-spot-ui-v44.css: published CSS
- deploy-rider-spot-v44.js: guarded re-deploy script for original v43 only. It rejects repeat deployment.
