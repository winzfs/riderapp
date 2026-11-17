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
OSM_OFFICE_NAMES = re.compile(
    r"시청|구청|군청|행정복지|주민센터|주민자치|(?:읍|면|동)사무소|"
    r"경찰|소방|파출소|지구대|치안센터|119|우체국|우편취급|"
    r"법원|검찰|세무서|보건소|세관|출입국|교육청|의회|"
    r"국토관리|고용센터|고용복지|보훈청|진흥원|공단|"
    r"선거관리|지방행정|민원실|소방안전"
)
ADMIN_URL = (
    "https://raw.githubusercontent.com/KnellBalm/kr-admin-geojson/"
    "3a859f2a45be8acf8237d9eefd9565f99cc603da/emd.geojson"
)

def point_in_ring(lon, lat, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        a, b = ring[i], ring[j]
        if ((a[1] > lat) != (b[1] > lat)) and (
            lon < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]
        ):
            inside = not inside
        j = i
    return inside

def read_gwangju_polygons():
    cached = Path("/tmp/rider-spot-korean-refresh/emd.geojson")
    if not cached.exists():
        cached.parent.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(
            ADMIN_URL, headers={"User-Agent": "RiderSpot-gov-map/1.0"}
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            cached.write_bytes(response.read(40_000_000))
    data = json.loads(cached.read_text(encoding="utf-8"))
    polygons = []
    feature_count = 0
    for feature in data.get("features", []):
        if (feature.get("properties") or {}).get("SIDO_NM") != "광주광역시":
            continue
        feature_count += 1
        geometry = feature.get("geometry") or {}
        typ = geometry.get("type")
        if typ == "Polygon":
            parts = [geometry.get("coordinates") or []]
        elif typ == "MultiPolygon":
            parts = geometry.get("coordinates") or []
        else:
            continue
        for rings in parts:
            if not rings or len(rings[0]) < 4:
                continue
            outer = rings[0]
            box = (min(p[0] for p in outer), min(p[1] for p in outer),
                   max(p[0] for p in outer), max(p[1] for p in outer))
            polygons.append((box, rings))
    if feature_count < 150 or len(polygons) < 150:
        raise RuntimeError("Cannot verify authoritative 2023 Gwangju EMD boundaries")
    print(f"V-World regional geometry validated: {len(polygons)} polygons", flush=True)
    return polygons

def inside_gwangju(lon, lat, polygons):
    for box, rings in polygons:
        if not (box[0] <= lon <= box[2] and box[1] <= lat <= box[3]):
            continue
        if point_in_ring(lon, lat, rings[0]) and not any(
            point_in_ring(lon, lat, hole) for hole in rings[1:]
        ):
            return True
    return False

OSM_AMENITIES = frozenset(("townhall", "police", "fire_station", "courthouse",
                           "post_office", "public_building"))
QUERY = """[out:json][timeout:35];
(
  nwr["name"]["amenity"~"^(townhall|police|fire_station|courthouse|post_office|public_building)$"](34.98,126.68,35.36,127.13);
  nwr["name"]["office"="government"](34.98,126.68,35.36,127.13);
);
out center;"""
ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
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

def osm_rows(payload, polygons=None):
    found = []
    for element in payload.get("elements", []):
        tags = element.get("tags") or {}
        if tags.get("amenity") not in OSM_AMENITIES and tags.get("office") != "government":
            continue
        name = tags.get("name:ko") or tags.get("name")
        if tags.get("amenity") not in OSM_AMENITIES and not OSM_OFFICE_NAMES.search(name or ""):
            continue
        centre = element.get("center") or element
        candidate = row(centre.get("lon"), centre.get("lat"), name)
        if candidate is None:
            continue
        if polygons is not None and not inside_gwangju(candidate[0], candidate[1], polygons):
            continue
        found.append(candidate)
    return unique(found)

def fetch_osm(polygons):
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
            places = osm_rows(payload, polygons)
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
    polygons = read_gwangju_polygons()
    previously = []
    if old_file.exists():
        previously = [row(x[0], x[1], x[2]) for x in json.loads(old_file.read_text(encoding="utf-8"))
                      if isinstance(x, list) and len(x) == 4 and x[3] == "government"]
        previously = [x for x in previously if x and inside_gwangju(x[0], x[1], polygons)]
    osm = fetch_osm(polygons)
    if osm is None:
        osm = previously
        print("Using verified previous OSM/government names as fallback", flush=True)
    all_rows = unique(official + osm)
    if len(all_rows) < len(official):
        raise RuntimeError("Government label count decreased below official source")
    old_count = len(previously)
    # The first polygon-boundary cleanup intentionally removes candidates that
    # used to fall within the large rectangle but outside Gwangju. On subsequent
    # refreshes require stronger coverage stability.
    boundary_verified = "verified within V-World" in manifest["sources"].get("government", "")
    min_fraction = 0.7 if boundary_verified else 0.35
    if old_count > 30 and len(all_rows) < old_count * min_fraction:
        raise RuntimeError(f"Government coverage dropped unexpectedly: {old_count} -> {len(all_rows)}")
    old_file.write_text(json.dumps(all_rows, ensure_ascii=False, separators=(",", ":")) + "\n",
                        encoding="utf-8")
    manifest["counts"]["government"] = len(all_rows)
    period = re.search(r"20\d{2}-\d{2}", manifest["sources"].get("shop", ""))
    snapshot = period.group() if period else "latest"
    manifest["sources"]["government"] = (
        f"SEMAS {snapshot} named government buildings + OpenStreetMap government POIs "
        "(ODbL; verified within V-World Gwangju administrative polygons)"
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
