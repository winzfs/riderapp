#!/usr/bin/env python3
"""Normalize approved Korean public geographic CSV/GeoJSON into Rider Spot map labels.

Input must be downloaded separately from its provider: no credentials are stored here.
The first release intentionally covers Gwangju; nationwide OSM labels remain available.
"""
import argparse
import csv
import json
import math
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "korean-map"
BBOX = (126.68, 34.98, 127.13, 35.36)  # Gwangju pilot, coordinate guard
SIZE = 0.04
MAX_LABEL = 64

def clean(v):
    return re.sub(r"\s+", " ", str(v or "")).strip()[:MAX_LABEL]

def valid(lon, lat):
    return all(map(math.isfinite, (lon, lat))) and BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]

def number(row, keys):
    for key in keys:
        try:
            v = float(str(row.get(key, "")).strip())
            if math.isfinite(v):
                return v
        except (ValueError, TypeError):
            pass
    return None

def tile_id(lon, lat):
    return f"t{math.floor(lon / SIZE)}-{math.floor(lat / SIZE)}"

def read_shops(path):
    records = defaultdict(list)
    seen_shops, seen_buildings = set(), set()
    counts = defaultdict(int)
    with open(path, "r", encoding="utf-8-sig", newline="") as src:
        reader = csv.DictReader(src)
        if not reader.fieldnames or not any(k in reader.fieldnames for k in ("상호명", "bizesNm")):
            raise ValueError("Unrecognized SEMAS store CSV header")
        if not any(k in reader.fieldnames for k in ("경도", "lon", "longitude")):
            raise ValueError("Missing longitude column")
        for row in reader:
            lon = number(row, ("경도", "lon", "longitude"))
            lat = number(row, ("위도", "lat", "latitude"))
            if lon is None or lat is None or not valid(lon, lat):
                continue
            sido = clean(row.get("시도명"))
            if sido and sido != "광주광역시":
                continue
            lon, lat = round(lon, 6), round(lat, 6)
            store = clean(row.get("상호명") or row.get("bizesNm"))
            store_id = clean(row.get("상가업소번호") or row.get("bizesId"))
            if store and store not in ("없음", "미상", "상호없음"):
                identity = store_id or (store, lon, lat)
                if identity not in seen_shops:
                    seen_shops.add(identity)
                    records[tile_id(lon, lat)].append([lon, lat, store, "shop"])
                    counts["shop"] += 1
            building = clean(row.get("건물명") or row.get("bldNm"))
            building_id = clean(row.get("건물관리번호") or row.get("bldMngNo"))
            if building and building not in ("없음", "미상", "일반건물", "무명건물"):
                identity = building_id or (building, round(lon, 4), round(lat, 4))
                if identity not in seen_buildings:
                    seen_buildings.add(identity)
                    is_apartment = bool(re.search(r"아파트|주공|래미안|자이|아이파크|힐스테이트|푸르지오|롯데캐슬|e편한세상|휴먼시아", building, re.I))
                    kind = "apartment" if is_apartment else "building"
                    records[tile_id(lon, lat)].append([lon, lat, building, kind])
                    counts[kind] += 1
    return records, counts

def all_vertices(geometry):
    coords = geometry.get("coordinates") or []
    kind = geometry.get("type")
    polygons = [coords] if kind == "Polygon" else coords if kind == "MultiPolygon" else []
    for poly in polygons:
        if not poly:
            continue
        for point in (poly[0] or []):
            if isinstance(point, (list, tuple)) and len(point) >= 2:
                yield point

def admin_names(geojson):
    data = json.loads(Path(geojson).read_text(encoding="utf-8"))
    seen, names = set(), []
    for feature in data.get("features", []):
        p = feature.get("properties") or {}
        if p.get("SIDO_NM") != "광주광역시":
            continue
        name = clean(p.get("EMD_KOR_NM"))
        code = clean(p.get("EMD_CD"))
        points = list(all_vertices(feature.get("geometry") or {}))
        if not name or not points or (code or name) in seen:
            continue
        seen.add(code or name)
        # For label placement use a bounded centroid approximation, not a building point.
        lon = sum(float(v[0]) for v in points) / len(points)
        lat = sum(float(v[1]) for v in points) / len(points)
        if valid(lon, lat):
            names.append([round(lon, 6), round(lat, 6), name, "region"])
    return sorted(names, key=lambda item: item[2])

def build(shops, admin, source_metadata=None):
    records, counts = read_shops(shops)
    admins = admin_names(admin)
    counts["region"] = len(admins)
    if counts["shop"] < 50_000 or counts["apartment"] < 100 or len(admins) < 150:
        raise ValueError("Missing substantial public labels; retain current release")
    metadata = json.loads(Path(source_metadata).read_text(encoding="utf-8")) if source_metadata else {}
    period = metadata.get("shops_snapshot", "202506")
    if not re.fullmatch(r"20\\d{4}", period):
        raise ValueError("Invalid source snapshot period")
    OUT.mkdir(parents=True, exist_ok=True)
    for path in OUT.glob("t*.json"):
        path.unlink()
    for key, labels in sorted(records.items()):
        (OUT / f"{key}.json").write_text(json.dumps(labels, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    (OUT / "admin.json").write_text(json.dumps(admins, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    manifest = {
        "schema": 1, "coverage": "광주광역시", "bbox": list(BBOX), "size": SIZE,
        "tiles": sorted(records), "counts": dict(counts),
        "sources": {
            "region": "V-World administrative polygons, 2023-07-29 (via KnellBalm/kr-admin-geojson; KOGI 1 attribution)",
            "shop": f"SEMAS business locations, {period[:4]}-{period[4:]} (via ginipick/market; public data portal open reuse)" if metadata.get("shops_source", "").startswith("SEMAS public CSV mirror") or not metadata else f"SEMAS business locations, {period[:4]}-{period[4:]} (approved public CSV)",
            "building": "SEMAS store-linked road-name building names, 2025-06 (not a complete building inventory)"
        }
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    # The bundles are an optional deployment transport, never browser assets.
    # This lets a release tool load many small tiles with a few GitHub file reads.
    bundle_dir = OUT / "bundles"
    bundle_dir.mkdir(parents=True, exist_ok=True)
    for old in bundle_dir.glob("pack-*.json"):
        old.unlink()
    buffer, used, index = {}, 0, 0
    for path in sorted(OUT.glob("*.json")):
        key = "/mapdata/" + path.name
        contents = path.read_text(encoding="utf-8")
        cost = len(json.dumps({key: contents}, ensure_ascii=False).encode("utf-8"))
        if buffer and used + cost > 900_000:
            (bundle_dir / f"pack-{index:02d}.json").write_text(
                json.dumps(buffer, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
            )
            index += 1
            buffer, used = {}, 0
        buffer[key] = contents
        used += cost
    if buffer:
        (bundle_dir / f"pack-{index:02d}.json").write_text(
            json.dumps(buffer, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
        )
    print("Map-data generated:", manifest["coverage"], dict(counts), "tiles", len(records))
    if not admins or counts["shop"] < 100:
        raise ValueError("Unexpectedly little public map data; refusing to publish")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--shops", required=True)
    parser.add_argument("--admin", required=True)
    parser.add_argument("--source-metadata", required=False)
    args = parser.parse_args()
    build(Path(args.shops), Path(args.admin), args.source_metadata)
