#!/usr/bin/env python3
"""Add Gwangju public-office text names from licensed OSM and official SEMAS buildings.

Outputs a small, position-verified 4-column /mapdata/government.json file.
NEVER adds a pin or interactive POI. An unreachable OSM service does not delete
previously verified government names.
"""
import json
import math
import re
import urllib.parse
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data" / "korean-map"
BBOX = (126.68, 34.98, 127.13, 35.36)
OFFICIAL_NAMES = re.compile(
    r"^(?:광주광역시청|(?:광산|동|서|남|북)구청)$|"
    r"(?:행정복지센터|주민센터|(?<!합)동사무소|우체국|보건소|세무서|경찰서|소방서|"
    r"소방본부|지구대|파출소|법원|검찰청|등기소|119안전센터)$"
)
OSM_AMENITIES = frozenset(("townhall", "police", "fire_station", "courthouse",
                           "post_office", "public_building"))
QUERY = """[out:json][timeout:35];
(
  nwr["name"]["amenity"~"^(townhall|police|fire_station|courthouse|post_office|public_building)$"](34.98,126.68,35.36,127.13);
  nwr["name"]["office"="government"](34.98,126.68,35.36,127.13);
);
out center;"""
ENDPOINTS = (
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
)

def valid(lon, lat):
    return (math.isfinite(lon) and math.isfinite(lat) and
            BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3])

def row(lon, lat, name):
    try:
        lon, lat = float(lon), float(lat)
    except (ValueError, TypeError):
        return None
    name = " ".join(str(name or "").split()).strip()
    if not valid(lon, lat) or not 2 <= len(name) <= 64:
        return None
    return [round(lon, 6), round(lat, 6), name, "government"]

def distance_m(a, b):
    return math.hypot((a[0] - b[0]) * 91000, (a[1] - b[1]) * 111000)

def unique(rows):
    result = []
    for item in rows:
        if item is None or any(item[2] == seen[2] and distance_m(item, seen) < 150
                               for seen in result):
            continue
        result.append(item)
    return sorted(result, key=lambda x: (x[2], x[0], x[1]))

def official_rows():
    found = []
    for path in sorted(DATA.glob("t*.json")):
        for item in json.loads(path.read_text(encoding="utf-8")):
            if len(item) != 4 or item[3] != "building":
                continue
            if OFFICIAL_NAMES.search(item[2]):
                found.append(row(item[0], item[1], item[2]))
    return unique(found)

def osm_rows(payload):
    found = []
    for element in payload.get("elements", []):
        tags = element.get("tags") or {}
        if tags.get("amenity") not in OSM_AMENITIES and tags.get("office") != "government":
            continue
        centre = element.get("center") or element
        found.append(row(centre.get("lon"), centre.get("lat"), tags.get("name:ko") or tags.get("name")))
    return unique(found)

def fetch_osm():
    for endpoint in ENDPOINTS:
        try:
            req = urllib.request.Request(
                endpoint,
                data=urllib.parse.urlencode({"data": QUERY}).encode(),
                headers={"User-Agent": "RiderSpot-public-map/1.0 (contact: GitHub winzfs/riderapp)",
                         "Content-Type": "application/x-www-form-urlencoded"},
            )
            with urllib.request.urlopen(req, timeout=65) as response:
                payload = json.load(response)
            places = osm_rows(payload)
            if not 15 <= len(places) <= 2000:
                raise RuntimeError(f"Implausible named government POI count: {len(places)}")
            print(f"OSM government names: {len(places)} from {endpoint}", flush=True)
            return places
        except Exception as exc:
            print(f"OSM government source unavailable: {endpoint}: {type(exc).__name__} {str(exc)[:100]}", flush=True)
    return None

def main():
    metadata_file = DATA / "manifest.json"
    manifest = json.loads(metadata_file.read_text(encoding="utf-8"))
    official = official_rows()
    if len(official) < 8:
        raise RuntimeError("Too few official named government buildings; refusing update")
    old_file = DATA / "government.json"
    previously = []
    if old_file.exists():
        previously = [row(x[0], x[1], x[2]) for x in json.loads(old_file.read_text(encoding="utf-8"))
                      if isinstance(x, list) and len(x) == 4 and x[3] == "government"]
    osm = fetch_osm()
    if osm is None:
        osm = previously
        print("Using verified previous OSM/government names as fallback", flush=True)
    all_rows = unique(official + osm)
    if len(all_rows) < len(official):
        raise RuntimeError("Government label count decreased below official source")
    old_count = len(previously)
    if old_count > 30 and len(all_rows) < old_count * 0.7:
        raise RuntimeError(f"Government coverage dropped unexpectedly: {old_count} -> {len(all_rows)}")
    old_file.write_text(json.dumps(all_rows, ensure_ascii=False, separators=(",", ":")) + "\n",
                        encoding="utf-8")
    manifest["counts"]["government"] = len(all_rows)
    manifest["sources"]["government"] = (
        "SEMAS 2026-09 named government buildings + OpenStreetMap government POIs "
        "(ODbL; most recent verified pull)"
    )
    metadata_file.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n",
                             encoding="utf-8")
    # Update the existing bundle with the government snapshot and manifest.
    pack = DATA / "bundles" / "pack-00.json"
    if pack.exists():
        obj = json.loads(pack.read_text(encoding="utf-8"))
        obj["/mapdata/government.json"] = old_file.read_text(encoding="utf-8")
        obj["/mapdata/manifest.json"] = metadata_file.read_text(encoding="utf-8")
        pack.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n",
                        encoding="utf-8")
    print(f"Validated public government text labels: {len(all_rows)} (official={len(official)}, OSM={len(osm)})", flush=True)

if __name__ == "__main__":
    main()
