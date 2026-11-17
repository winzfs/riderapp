#!/usr/bin/env python3
"""Fetch the newest permitted Gwangju SEMAS CSV from a public, versioned feed.

Use KOREAN_SHOPS_CSV_URL only for an independently approved public CSV URL.
Fail closed on missing, malformed or unexpectedly small data; never fall back
silently to an older file when the newest source cannot be downloaded.
"""
import hashlib
import json
import os
import pathlib
import re
import sys
import urllib.parse
import urllib.request

DEST = pathlib.Path("/tmp/rider-spot-korean-refresh")
HUB = "https://huggingface.co"
DATASET = "ginipick/market"
UA = "RiderSpot-KoreanMapUpdate/1.0 (public source validation)"
MAX_BYTES = 180 * 1024 * 1024
MIN_BYTES = 2 * 1024 * 1024
FILE_PATTERN = re.compile(r"^소상공인시장진흥공단_상가\(상권\)정보_광주_(20\d{4})\.csv$")

def download(url, dest, limit=MAX_BYTES):
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    length = 0
    digest = hashlib.sha256()
    with urllib.request.urlopen(request, timeout=120) as response, dest.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            length += len(chunk)
            if length > limit:
                raise RuntimeError("Source exceeds maximum size; refusing import")
            digest.update(chunk)
            output.write(chunk)
    return {"bytes": length, "sha256": digest.hexdigest()}

def select_shops():
    specified = os.environ.get("KOREAN_SHOPS_CSV_URL", "").strip()
    if specified:
        parsed = urllib.parse.urlparse(specified)
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("KOREAN_SHOPS_CSV_URL must be an HTTPS CSV download")
        version = os.environ.get("KOREAN_SHOPS_SNAPSHOT", "").strip()
        if not re.fullmatch(r"20\d{4}", version):
            raise ValueError("For custom CSV URLs set KOREAN_SHOPS_SNAPSHOT=YYYYMM")
        return specified, version, "Configured SEMAS CSV snapshot"
    url = HUB + "/api/datasets/" + DATASET + "/tree/main?recursive=false"
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=45) as resp:
        entries = json.load(resp)
    matches = []
    for entry in entries:
        name = str(entry.get("path", ""))
        found = FILE_PATTERN.fullmatch(name)
        if found and entry.get("type") == "file":
            matches.append((found.group(1), name))
    if not matches:
        raise RuntimeError("Public source does not list Gwangju CSV snapshots")
    period, filename = max(matches)
    url = HUB + "/datasets/" + DATASET + "/resolve/main/" + urllib.parse.quote(filename) + "?download=true"
    return url, period, "SEMAS public CSV mirror (ginipick/market)"

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    shops_url, period, source_name = select_shops()
    shops = DEST / "shops.csv"
    shops_result = download(shops_url, shops)
    if shops_result["bytes"] < MIN_BYTES:
        raise RuntimeError("Gwangju store source is too small")
    header = shops.open("r", encoding="utf-8-sig").readline()
    if not ("상호명" in header or "bizesNm" in header):
        raise RuntimeError("Unrecognized SEMAS file header")
    admin_url = ("https://raw.githubusercontent.com/KnellBalm/kr-admin-geojson/"
                 "3a859f2a45be8acf8237d9eefd9565f99cc603da/emd.geojson")
    admin = DEST / "emd.geojson"
    admin_result = download(admin_url, admin, 40 * 1024 * 1024)
    with admin.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if len(data.get("features", [])) < 100:
        raise RuntimeError("Unexpectedly small official district source")
    print("Selected SEMAS public snapshot:", period, shops_result["bytes"], shops_result["sha256"])
    print("Administrative source:", admin_result["sha256"])
    metadata = {"shops_snapshot": period, "shops_source": source_name, "shops_sha256": shops_result["sha256"],
                "admin_sha256": admin_result["sha256"]}
    (DEST / "source.json").write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")

if __name__ == "__main__":
    main()
