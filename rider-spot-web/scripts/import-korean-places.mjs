#!/usr/bin/env node
// Offline ingestion of an authorized SEMAS CSV/JSON export.
// Usage: node scripts/import-korean-places.mjs source.csv output.geojson shop
import { readFile, writeFile } from "node:fs/promises";
import { normalizeKoreanPlaces } from "../src/korean-place-normalizer.mjs";
const [input, output, kind = "shop"] = process.argv.slice(2);
if (!input || !output) throw Error("Usage: node scripts/import-korean-places.mjs input.csv|json output.geojson [shop|building|apartment|region|facility]");
const raw = await readFile(input, "utf8");
function parseCSV(csv) {
  const records = []; let fields = [], field = "", quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      if (quoted && csv[i+1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) { fields.push(field); field = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && csv[i+1] === "\n") i++;
      fields.push(field); field = "";
      if (fields.some(v => v.trim())) records.push(fields);
      fields = [];
    } else field += ch;
  }
  if (quoted) throw Error("Unclosed CSV quoted field");
  if (field || fields.length) { fields.push(field); records.push(fields); }
  const headers = records.shift()?.map(v => v.replace(/^\uFEFF/, "").trim()) ?? [];
  return records.map(record => Object.fromEntries(headers.map((header, i) => [header, record[i] ?? ""])));
}
const parsed = input.toLowerCase().endsWith(".json") ? JSON.parse(raw) : parseCSV(raw);
const rows = Array.isArray(parsed) ? parsed : parsed.body?.items ?? parsed.items ?? parsed.data;
if (!Array.isArray(rows)) throw Error("Input must be an array, CSV, or API response containing items");
const result = normalizeKoreanPlaces(rows, kind);
await writeFile(output, JSON.stringify(result));
console.log("Imported", result.features.length, "of", rows.length, kind, "records");
