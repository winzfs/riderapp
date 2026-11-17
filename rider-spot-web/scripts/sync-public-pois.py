#!/usr/bin/env python3
"""Weekly public POI snapshot from the Geofabrik South Korea OSM extract.

No user positions, rider reports or database credentials are read. The JSON
is an ODbL-derived dataset and is kept publicly accessible in GitHub.
Requires: osmium==4.3.2 (pyosmium).
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import osmium

BBOX = (35.08, 126.67, 35.25, 126.92)  # pilot area around Gwangsan-gu
AMENITIES = {"toilets", "fuel", "shelter", "library", "hospital",
             "townhall", "police", "community_centre"}
TAG_KEYS = {"amenity", "leisure", "tourism", "name", "name:ko", "brand",
            "opening_hours", "wheelchair", "fee", "shelter_type", "highway",
            "access", "disused", "abandoned", "demolished", "website",
            "contact:website"}


def in_area(lat: float, lon: float) -> bool:
    return BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lon <= BBOX[3]


def eligible(tags: dict[str, str]) -> bool:
    if tags.get("access") in ("private", "no"):
        return False
    if any(tags.get(key) == "yes" for key in ("disused", "abandoned", "demolished")):
        return False
    if tags.get("amenity") == "shelter":
        if tags.get("shelter_type") == "public_transport" or tags.get("highway") == "bus_stop":
            return False
        return True
    if tags.get("amenity") in AMENITIES:
        return True
    if tags.get("leisure") == "park" or tags.get("tourism") == "attraction":
        return bool(tags.get("name:ko") or tags.get("name"))
    return False


class FacilityExtractor(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.items: dict[str, dict] = {}

    def add(self, kind: str, item_id: int, lat: float, lon: float, tags: dict[str, str]) -> None:
        if not in_area(lat, lon) or not eligible(tags):
            return
        key = f"{kind}/{item_id}"
        self.items[key] = {
            "type": kind, "id": int(item_id),
            "lat": round(lat, 7), "lon": round(lon, 7),
            "tags": {k: v[:250] for k, v in tags.items() if k in TAG_KEYS},
        }

    def node(self, n: osmium.osm.Node) -> None:
        if not n.tags or not n.location.valid():
            return
        tags = {tag.k: tag.v for tag in n.tags}
        if eligible(tags):
            self.add("node", n.id, n.location.lat, n.location.lon, tags)

    def way(self, w: osmium.osm.Way) -> None:
        if not w.tags:
            return
        tags = {tag.k: tag.v for tag in w.tags}
        if not eligible(tags):
            return
        coords = [(pt.location.lat, pt.location.lon) for pt in w.nodes if pt.location.valid()]
        if not coords:
            return
        lat = sum(p[0] for p in coords) / len(coords)
        lon = sum(p[1] for p in coords) / len(coords)
        self.add("way", w.id, lat, lon, tags)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: sync-public-pois.py INPUT.osm.pbf OUTPUT.json")
    source, destination = Path(sys.argv[1]), Path(sys.argv[2])
    if not source.exists() or source.stat().st_size < 1_000_000:
        raise SystemExit("OSM source missing or unexpectedly small")
    importer = FacilityExtractor()
    importer.apply_file(str(source), locations=True, idx="flex_mem")
    records = sorted(importer.items.values(), key=lambda row: (row["type"], row["id"]))
    if len(records) < 8:
        raise SystemExit(f"Refusing an undersized dataset ({len(records)})")
    if destination.exists():
        before = json.loads(destination.read_text(encoding="utf-8"))
        old_count = len(before.get("elements", []))
        if old_count >= 40 and len(records) < old_count * .55:
            raise SystemExit(f"Unexpected POI shrink {old_count} -> {len(records)}")
    data = {
        "region": "gwangsan",
        "coverage": "Gwangsan-gu pilot bounding box, not an administrative boundary",
        "source": "OpenStreetMap contributors via Geofabrik, ODbL 1.0",
        "license_url": "https://www.openstreetmap.org/copyright",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "elements": records,
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_suffix(".new")
    temp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temp.replace(destination)
    print(f"Published {len(records)} OSM POIs for Gwangsan pilot; {destination}")


if __name__ == "__main__":
    main()
