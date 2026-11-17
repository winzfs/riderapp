import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createWorkDrafts } from "../src/work-drafts.mjs";
import { upcomingMaintenance } from "../src/maintenance-due.mjs";

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
  const render = new Function("S", "H", "formField", "nowDate", "upcomingMaintenance", "M",
    section("renderMaintenance", "renderAnalysis") + "return renderMaintenance();");
  const html = render(S, String, field, () => "2026-11-18", upcomingMaintenance, (n) => String(n) + "원");
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

test("Drafts survive a tab change but are isolated per user", () => {
  let time = Date.UTC(2026, 10, 18, 0, 0, 0);
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  const drafts = createWorkDrafts(storage, () => time);
  const fields = {
    work_date: { type: "date", value: "2026-11-18" },
    platform: { type: "select-one", value: "배민" },
    gross_won: { type: "number", value: "92000" },
    deliveries: { type: "number", value: "0" },
    hours: { type: "number", value: "" },
    distance_km: { type: "number", value: "0" },
    expenses_won: { type: "number", value: "0" },
    note: { type: "text", value: "" },
  };
  const fakeForm = {
    dataset: { rsForm: "earnings" },
    elements: { namedItem: (key) => fields[key] || null },
    querySelector: () => ({ open: true }),
  };
  drafts.save("user-a", fakeForm);
  assert.equal(drafts.read("user-a", "earnings").values.gross_won, "92000");
  assert.equal(drafts.read("user-b", "earnings"), null);
  assert.equal(drafts.read("user-a", "fuel"), null);
  time += 8 * 86400000;
  assert.equal(drafts.read("user-a", "earnings"), null, "expired drafts are discarded");
});

test("Drafts never overwrite an edit and are cleared after successful save", () => {
  const memory = new Map();
  const drafts = createWorkDrafts({
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  });
  const form = {
    dataset: { rsForm: "fuel" },
    elements: { namedItem: (key) => key === "cost_won"
      ? { type: "number", value: "8000" } : null },
    querySelector: () => null,
  };
  drafts.save("rider-a", form);
  assert.ok(drafts.read("rider-a", "fuel"));
  form.dataset.rsSaved = "1";
  drafts.save("rider-a", form);
  drafts.clear("rider-a", "fuel");
  assert.equal(drafts.read("rider-a", "fuel"), null);
});

test("Record edits use row-id AND account ownership filters", () => {
  for (const table of ["rider_earnings", "rider_fuel_logs", "maintenance_logs"]) {
    const expected = 'client.from("' + table + '").update(values)';
    const index = source.indexOf(expected);
    assert.ok(index > 0, "update for " + table);
    const code = source.slice(index, index + 190);
    assert.ok(code.includes('.eq("id", editing.id)'), table + " row filter");
    assert.ok(code.includes('.eq("user_id", user.id)'), table + " owner filter");
    assert.ok(code.includes('.select("id").maybeSingle()'), table + " success check");
  }
});

test("Maintenance reminders use only explicitly recorded service distances", () => {
  const maintenance = [
    { item: "엔진오일", serviced_on: "2026-11-10", odometer_km: 14950, next_due_km: 15500 },
    { item: "엔진오일", serviced_on: "2026-10-01", odometer_km: 12800, next_due_km: 13300 },
    { item: "타이어", serviced_on: "2026-10-12", odometer_km: 14000, next_due_km: null },
  ];
  const fuel = [{ fueled_on: "2026-11-18", odometer_km: 15100 }];
  const result = upcomingMaintenance(maintenance, fuel);
  assert.equal(result.odometerKm, 15100);
  assert.equal(result.due.length, 1);
  assert.equal(result.due[0].item, "엔진오일");
  assert.equal(result.due[0].nextDueKm, 15500);
  assert.deepEqual(upcomingMaintenance(maintenance, [] ).due.length, 0);
  assert.deepEqual(upcomingMaintenance(maintenance.map((x) => ({ ...x, next_due_km: null })), fuel).due, []);
  assert.deepEqual(upcomingMaintenance(maintenance, [{ fueled_on: "2026-11-18", odometer_km: null }]).due, []);
});
