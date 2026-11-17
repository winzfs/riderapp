import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

refresh = load_module("refresh_korean_map", "refresh-korean-map.py")
imports = load_module("import_korean_map", "import-korean-map.py")

class OfficialCombinedRegionTests(unittest.TestCase):
    def test_combined_province_is_gwangju_only_for_five_city_districts(self):
        base = dict(시도명="전남광주통합특별시", 시군구명="광산구", 경도="126.83", 위도="35.17")
        self.assertTrue(refresh.belongs_to_gwangju(base))
        self.assertTrue(refresh.belongs_to_gwangju(dict(base, 시도명="광주광역시")))
        self.assertFalse(refresh.belongs_to_gwangju(dict(base, 시군구명="나주시")))
        self.assertFalse(refresh.belongs_to_gwangju(dict(base, 경도="127.50")))
        self.assertFalse(refresh.belongs_to_gwangju(dict(base, 위도="NaN")))

    def test_importer_keeps_new_and_legacy_gwangju_but_not_neighbouring_jeonnam(self):
        fields = ["상가업소번호", "상호명", "시도명", "시군구명", "경도", "위도", "건물명", "건물관리번호"]
        rows = [
            ["1", "신규2026상점", "전남광주통합특별시", "광산구", "126.83", "35.17", "수완아파트", "b1"],
            ["2", "전남매장제외", "전남광주통합특별시", "나주시", "126.84", "35.18", "", ""],
            ["3", "기존광주매장", "광주광역시", "서구", "126.88", "35.16", "상무빌딩", "b2"],
            ["4", "외부좌표제외", "전남광주통합특별시", "광산구", "128.3", "35.17", "", ""],
        ]
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "shops.csv"
            with path.open("w", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(fields)
                writer.writerows(rows)
            records, counts = imports.read_shops(path)
            names = [x[2] for items in records.values() for x in items]
            self.assertEqual(counts["shop"], 2)
            self.assertEqual(counts["apartment"], 1)
            self.assertEqual(counts["building"], 1)
            self.assertIn("신규2026상점", names)
            self.assertNotIn("전남매장제외", names)

if __name__ == "__main__":
    unittest.main()
