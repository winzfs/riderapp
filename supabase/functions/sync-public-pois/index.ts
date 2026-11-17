// Rider Spot public POI importer — isolated from rider_places and ride history.
// OSM ODbL attribution: https://www.openstreetmap.org/copyright
// Triggered weekly by Supabase Cron via a vaulted token; no browser may invoke it.
// A failed or truncated Overpass request must never erase last-known-good records.
import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const REGION = "gwangsan";
const BOUNDS = { south: 35.08, west: 126.67, north: 35.25, east: 126.92 };
const OVERPASS = "https://overpass-api.de/api/interpreter";
const PREFIX = `(${BOUNDS.south},${BOUNDS.west},${BOUNDS.north},${BOUNDS.east})`;
const QUERY = `[out:json][timeout:55];
(
  nwr["amenity"~"^(toilets|fuel|shelter|library|hospital|townhall|police|community_centre)$"]${PREFIX};
  nwr["leisure"="park"]${PREFIX};
  nwr["tourism"="attraction"]${PREFIX};
);
out center tags;`;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

type Element = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

function normalize(element: Element) {
  const tags = element.tags || {};
  const type = element.type;
  const id = element.id;
  if (!["node", "way", "relation"].includes(type || "") ||
      !Number.isSafeInteger(id) || Number(id) <= 0) return null;
  const lat = Number(element.lat ?? element.center?.lat);
  const lng = Number(element.lon ?? element.center?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < BOUNDS.south || lat > BOUNDS.north ||
      lng < BOUNDS.west || lng > BOUNDS.east) return null;
  if (["private", "no"].includes(tags.access) ||
      tags.disused === "yes" || tags.abandoned === "yes" || tags.demolished === "yes") return null;

  let category: string;
  if (tags.amenity === "toilets") category = "화장실";
  else if (tags.amenity === "fuel") category = "주유소";
  else if (tags.amenity === "shelter") {
    if (tags.shelter_type === "public_transport" || tags.highway === "bus_stop") return null;
    category = "쉼터";
  } else category = "주요시설";

  const name = String(tags["name:ko"] || tags.name || tags.brand || "").trim();
  if (category === "주요시설" && !name) return null;
  const fallback = category === "화장실" ? "공중화장실" :
    category === "주유소" ? "주유소" : "쉼터";
  const title = (name || fallback).slice(0, 160);
  const info = [];
  if (tags.opening_hours) info.push("운영시간: " + tags.opening_hours.slice(0, 120));
  if (tags.wheelchair === "yes") info.push("휠체어 이용 가능");
  if (tags.fee === "yes") info.push("유료 이용");
  if (category === "주요시설") {
    if (tags.amenity) info.push("시설: " + tags.amenity.slice(0, 50));
    else if (tags.leisure) info.push("시설: 공원");
    else if (tags.tourism) info.push("시설: 관광지");
  }
  const website = tags.website || tags["contact:website"] || null;
  return {
    source: "osm", source_id: `${type}/${id}`, region: REGION,
    category, title, lat, lng,
    details: info.join(" · ").slice(0, 360),
    website: typeof website === "string" && /^https?:\/\//.test(website) ? website.slice(0, 250) : null,
    osm_url: `https://www.openstreetmap.org/${type}/${id}`,
    active: true, imported_at: new Date().toISOString(),
  };
}

async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = request.headers.get("x-rs-poi-sync") || "";
  if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server unavailable" }, 503);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: control, error: controlError } = await admin.from("poi_import_control")
    .select("token_hash,last_count,last_success_at")
    .eq("region", REGION).maybeSingle();
  if (controlError || !control?.token_hash) return json({ error: "Sync not configured" }, 503);
  const actualHash = await hashToken(token);
  // Both hashes have identical fixed length; do not short-circuit comparisons.
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= actualHash.charCodeAt(i) ^ control.token_hash.charCodeAt(i);
  if (diff !== 0) return json({ error: "Unauthorized" }, 401);

  try {
    // Some public Overpass mirrors return 406 for POST traffic from shared
    // serverless IP ranges. Try one small GET on each of two instances.
    // There is never a retry loop and the schedule runs only once per week.
    let raw = "";
    const errors: string[] = [];
    for (const endpoint of [OVERPASS, "https://overpass.private.coffee/api/interpreter"]) {
      try {
        const response = await fetch(endpoint + "?data=" + encodeURIComponent(QUERY), {
          method: "GET",
          headers: {
            "User-Agent": "RiderSpotPublicPOI/1.0 (https://rider-spot.jazzhjm.workers.dev/)",
            "Accept": "application/json",
          },
          signal: AbortSignal.timeout(65000),
        });
        if (!response.ok) {
          const summary = (await response.text()).slice(0, 130).replace(/[^ a-zA-Z0-9.:_-]/g, " ");
          throw new Error("HTTP " + response.status + " " + summary);
        }
        raw = await response.text();
        break;
      } catch (error) {
        errors.push(new URL(endpoint).host + ": " + String(error instanceof Error ? error.message : error).slice(0, 150));
      }
    }
    if (!raw) throw new Error("OSM mirrors unavailable (" + errors.join("; ").slice(0, 200) + ")");
    if (raw.length > 6_000_000) throw new Error("OSM response too large");
    const payload = JSON.parse(raw);
    if (!Array.isArray(payload.elements)) throw new Error("OSM elements missing");
    const unique = new Map<string, ReturnType<typeof normalize>>();
    for (const item of payload.elements as Element[]) {
      const entry = normalize(item);
      if (entry) unique.set(entry.source_id, entry);
    }
    const records = [...unique.values()].filter(Boolean);
    if (records.length < 8) throw new Error("Unusually small OSM import");
    if (control.last_count >= 40 && records.length < control.last_count * .55)
      throw new Error("OSM import shrank unexpectedly; last known data preserved");

    // Upsert in bounded batches. We deliberately do not delete missing records:
    // a partial upstream response cannot mass-delete users' facility markers.
    for (let i = 0; i < records.length; i += 150) {
      const { error } = await admin.from("public_pois")
        .upsert(records.slice(i, i + 150), { onConflict: "source,source_id" });
      if (error) throw new Error("Database import: " + error.message);
    }
    const { error: finishError } = await admin.from("poi_import_control")
      .update({ last_success_at: new Date().toISOString(),
        last_count: records.length, last_error: null, updated_at: new Date().toISOString() })
      .eq("region", REGION);
    if (finishError) throw finishError;
    return json({ ok: true, region: REGION, count: records.length, source: "OpenStreetMap ODbL" });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 200);
    console.error("Rider Spot POI sync failed:", message);
    await admin.from("poi_import_control")
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq("region", REGION);
    return json({ ok: false, message: "OSM unavailable; last known data kept" }, 503);
  }
});
