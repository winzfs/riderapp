import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("../src/workspace-tools.js", import.meta.url)), "utf8");
const S = { user: { id: "tester" }, platform: "", period: "today", dataLoaded: true,
  data: { earnings: [], maintenance: [], fuel: [] } };
const field = (label, name, type, opts = {}) =>
  '<label>' + label + '<input name="' + name + '" type="' + type + '" ' +
  (opts.required ? "required " : "") + 'value="' + (opts.value || "") + '"></label>';
const section = (start, end) => {
  const first = source.indexOf("  function " + start + "(");
  const last = source.indexOf("  function " + end + "(", first);
  assert.ok(first >= 0 && last > first, "expected " + start + " section");
  return source.slice(first, last);
};

test("Maintenance quick entry retains legacy maintenance screen", () => {
  const render = new Function("S", "H", "formField", "nowDate",
    section("renderMaintenance", "renderAnalysis") + "return renderMaintenance();");
  const html = render(S, String, field, () => "2026-11-18");
  for (const expected of [
    'data-rs-form="maintenance"',
    'id="rs-maint-ui"',
    'data-rs-maint-item="엔진오일"',
    'name="item"', 'name="cost_won"',
    'value="2026-11-18"',
  ]) assert.ok(html.includes(expected), expected);
});

test("Income can be saved without mileage, hours or delivery count", () => {
  const render = new Function(
    "S", "completedRideRows", "window", "nowDate", "N", "H", "M", "fmtFloat",
    "delButton", "summaryTile", "card", "formField", "selectField", "empty",
    section("renderEarnings", "renderFuel") + "return renderEarnings();",
  );
  const html = render(S, () => [], { __rsRideApi: { history: [] } },
    () => "2026-11-18", Number, String, (n) => String(n) + "원",
    (n) => Number(n || 0).toFixed(1), () => "", () => "",
    (_, body) => body, field, () => "<select></select>", () => "<p>없음</p>");
  assert.match(html, /name="gross_won"[^>]*required/);
  for (const name of ["hours", "distance_km", "deliveries"])
    assert.doesNotMatch(html, new RegExp('name="' + name + '"[^>]*required'));
  assert.ok(html.includes('rs63-earnings-more'));
});

test("Work hub prioritizes quick entry before detailed summary", () => {
  const render = new Function("S", "window", "H", "iconMarkup", "workOverview",
    section("renderHub", "fuelRate") + "return renderHub();");
  const html = render(S, { __rsRideApi: {} }, String, () => "", () => "<section>요약</section>");
  assert.ok(html.indexOf("빠른 기록") >= 0);
  assert.ok(html.indexOf("빠른 기록") < html.indexOf("요약"));
});
