#!/usr/bin/env python3
"""Fetch the newest permitted Gwangju SEMAS CSV from a public, versioned feed.

Use KOREAN_SHOPS_CSV_URL only for an independently approved public CSV URL.
Fail closed on missing, malformed or unexpectedly small data; never fall back
silently to an older file when the newest source cannot be downloaded.
"""
import hashlib
import csv
import io
import zipfile
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
OFFICIAL_ARCHIVE_MAX_BYTES = 850 * 1024 * 1024
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


GWANGJU_DISTRICTS = frozenset(("광산구", "동구", "서구", "남구", "북구"))
GWANGJU_BBOX = (126.68, 34.98, 127.13, 35.36)

def belongs_to_gwangju(row):
    """Since 2026-09 SEMAS groups Gwangju with Jeonnam.
    Keep only the five former Gwangju city districts with valid coordinates.
    """
    if not isinstance(row, dict):
        return False
    province = str(row.get("시도명") or "").strip()
    district = str(row.get("시군구명") or "").strip()
    if province not in ("광주광역시", "전남광주통합특별시"):
        return False
    if district not in GWANGJU_DISTRICTS:
        return False
    try:
        lon, lat = float(row["경도"]), float(row["위도"])
    except (ValueError, TypeError, KeyError):
        return False
    return GWANGJU_BBOX[0] <= lon <= GWANGJU_BBOX[2] and GWANGJU_BBOX[1] <= lat <= GWANGJU_BBOX[3]


def current_official_csv():
    """Try the current unauthenticated national SEMAS ZIP from data.go.kr."""
    page = "https://www.data.go.kr/data/15083033/fileData.do"
    headers = {"User-Agent": "Mozilla/5.0 (RiderSpot public data)", "Referer": page}
    with urllib.request.urlopen(urllib.request.Request(page, headers=headers), timeout=40) as response:
        html = response.read(4_000_000).decode("utf-8", "replace")
    found = re.search(r"fileDataDown\('([^']+)'\s*,\s*'([^']+)'", html)
    if not found or found.group(1) != "15083033" or not found.group(2).startswith("uddi:"):
        raise RuntimeError("Official download metadata link unavailable")
    args = {
        "publicDataDetailPk": found.group(2), "publicDataPk": found.group(1),
        "atchFileId": "", "fileDetailSn": "1",
        "url": "/tcs/dss/selectFileDataDownload.do",
    }
    info_url = "https://www.data.go.kr/tcs/dss/selectFileDataDownload.do?" + urllib.parse.urlencode(args)
    with urllib.request.urlopen(urllib.request.Request(info_url, headers=headers), timeout=45) as response:
        data = json.load(response)
    fid = str(data.get("atchFileId") or "")
    file_sn = str(data.get("fileDetailSn") or "")
    name = str((data.get("dataSetFileDetailInfo") or {}).get("dataNm") or "")
    if not re.fullmatch(r"FILE_\d{8,}", fid) or not file_sn.isdigit():
        raise RuntimeError("Official attachment ID is invalid")
    period_match = re.search(r"_(20\d{4})\d{2}$", name)
    if not period_match:
        raise RuntimeError("Official SEMAS snapshot period cannot be verified")
    period = period_match.group(1)
    args = {"atchFileId": fid, "fileDetailSn": file_sn, "dataNm": name}
    url = "https://www.data.go.kr/cmm/cmm/fileDownload.do?" + urllib.parse.urlencode(args)
    archive = DEST / "semas-official.zip"
    result = download(url, archive, OFFICIAL_ARCHIVE_MAX_BYTES)
    if result["bytes"] < MIN_BYTES:
        raise RuntimeError("Official SEMAS download is too small")
    shops = DEST / "shops.csv"
    def read_csv(handle, outwriter):
        # Source is documented as UTF-8. Filter the national CSV to Gwangju.
        reader = csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig", newline=""))
        if not reader.fieldnames or not {"상호명", "경도", "위도", "시도명"}.issubset(set(reader.fieldnames)):
            raise RuntimeError("Unexpected columns in official SEMAS CSV")
        count = 0
        for record in reader:
            if belongs_to_gwangju(record):
                outwriter.writerow(record)
                count += 1
        return count
    count = 0
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as zipped:
            candidates = [x for x in zipped.infolist()
                          if x.filename.lower().endswith(".csv") and x.file_size < 600_000_000]
            if not candidates:
                raise RuntimeError("Official archive has no CSV files")
            print("OFFICIAL ZIP members:", len(zipped.infolist()), "candidate CSV:", len(candidates), flush=True)
            # Prefer Gwangju CSV, otherwise scan all regional CSVs.
            region_files = [x for x in candidates if "광주" in x.filename]
            files = region_files or candidates
            with shops.open("w", encoding="utf-8", newline="") as dest:
                writer = None
                for item in files:
                    with zipped.open(item) as infile:
                        reader = csv.DictReader(io.TextIOWrapper(infile, encoding="utf-8-sig", newline=""))
                        first = next(reader, None)
                        print("OFFICIAL ZIP city CSV:", item.filename, "region:", repr(first.get("시도명")) if first else None,
                              "district:", repr(first.get("시군구명")) if first else None, flush=True)
                        if not reader.fieldnames or not {"상호명", "경도", "위도", "시도명"}.issubset(set(reader.fieldnames)):
                            continue
                        if writer is None:
                            writer = csv.DictWriter(dest, fieldnames=reader.fieldnames)
                            writer.writeheader()
                        for row in ([first] if first else []):
                            if belongs_to_gwangju(row):
                                writer.writerow(row)
                                count += 1
                        for row in reader:
                            if belongs_to_gwangju(row):
                                writer.writerow(row)
                                count += 1
    else:
        with shops.open("w", encoding="utf-8", newline="") as dest, archive.open("rb") as infile:
            reader = csv.DictReader(io.TextIOWrapper(infile, encoding="utf-8-sig", newline=""))
            if not reader.fieldnames or not {"상호명", "경도", "위도", "시도명"}.issubset(set(reader.fieldnames)):
                raise RuntimeError("Official CSV columns are unrecognized")
            writer = csv.DictWriter(dest, fieldnames=reader.fieldnames)
            writer.writeheader()
            for row in reader:
                if belongs_to_gwangju(row):
                    writer.writerow(row)
                    count += 1
    if count < 50_000 or count > 230_000:
        raise RuntimeError(f"Unexpected official Gwangju records: {count}")
    digest = hashlib.sha256(shops.read_bytes()).hexdigest()
    print("Official 2026 SEMAS CSV:", period, "records", count, "sha256", digest)
    return shops, period, "Official SEMAS data.go.kr public CSV", digest


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
    custom = os.environ.get("KOREAN_SHOPS_CSV_URL", "").strip()
    if not custom:
        try:
            shops, period, source_name, sha = current_official_csv()
            shops_result = {"bytes": shops.stat().st_size, "sha256": sha}
        except Exception as error:
            if os.environ.get("KOREAN_ALLOW_OLD_MIRROR_FALLBACK") != "1":
                raise RuntimeError("Official SEMAS snapshot could not be verified; previous map data remains active") from error
            print("WARNING: official source unavailable; explicitly permitted mirror fallback:", type(error).__name__, str(error)[:170])
            shops_url, period, source_name = select_shops()
            shops = DEST / "shops.csv"
            shops_result = download(shops_url, shops)
    else:
        shops_url, period, source_name = select_shops()
        shops = DEST / "shops.csv"
        shops_result = download(shops_url, shops)
    if shops_result["bytes"] < MIN_BYTES:
        raise RuntimeError("Gwangju store source is too small")
    with shops.open("r", encoding="utf-8-sig") as input:
        header = input.readline()
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
