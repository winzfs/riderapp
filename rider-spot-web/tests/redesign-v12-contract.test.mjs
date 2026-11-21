import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const source = path => readFileSync(new URL("../src/"+path, import.meta.url),"utf8");
test("v12 map settings keep single-choice layers and separate user-controlled privacy", () => {
 const app=source("application.mjs");
 assert.match(app, /rs12-layer-options/);
 assert.match(app, /role: "switch", "aria-checked": !!sharing/);
 assert.match(app, /onClick: toggle/);
 assert.match(app, /window.__rsGoToTab/);
});
test("v12 timeline preserves route toggles and saved ride recap", () => {
 const t=source("Timeline.mjs");
 assert.match(t, /rs12-route-filters/);
 assert.match(t, /rs12-route-more/);
 assert.match(t, /setRecapDay\(day\)/);
 assert.equal((t.match(/rs11-timeline-insights/g)||[]).length,1);
});
test("v12 community feed is content-first with actual metadata", () => {
 const a=source("application.mjs");
 assert.match(a,/rs12-community-masthead/);
 assert.match(a,/rs12-feed-topline/);
 assert.match(a,/toggleLike\(p\)/);
});
test("v12 stylesheet preserves high-contrast controls and reduced motion",()=>{
 const c=source("curated-v9.css");
 assert.match(c,/URBAN EDITORIAL V12/);
 assert.match(c,/prefers-reduced-motion:reduce/);
 assert.match(c,/\.rs12-share-control\.active/);
});
