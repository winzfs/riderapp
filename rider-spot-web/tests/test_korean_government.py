import importlib.util
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("rider_government",ROOT/"scripts"/"refresh-korean-government.py")
gov=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gov)

class GovernmentNamesTests(unittest.TestCase):
    def test_only_real_official_building_names(self):
        yes=["광주광역시청","광산구청","북구청","수완동행정복지센터",
             "평동주민센터","첨단우체국","광주고등검찰청"]
        no=["더벤티광주남구청","첨단2지구대성베르힐","온누리행정사합동사무소"]
        for name in yes: self.assertTrue(gov.OFFICIAL_NAMES.search(name),name)
        for name in no: self.assertFalse(gov.OFFICIAL_NAMES.search(name),name)

    def test_osm_only_government_tags_with_valid_geolocation(self):
        payload={"elements":[
            {"type":"node","id":1,"lat":35.17,"lon":126.82,"tags":{"name":"광산구청","office":"government"}},
            {"type":"way","id":2,"center":{"lat":35.18,"lon":126.81},"tags":{"name":"광주경찰서","amenity":"police"}},
            {"type":"node","id":3,"lat":35.18,"lon":126.81,"tags":{"name":"고객상담센터","office":"company"}},
            {"type":"node","id":4,"lat":37.20,"lon":127.5,"tags":{"name":"외부관청","office":"government"}},
        ]}
        rows=gov.osm_rows(payload)
        self.assertEqual(len(rows),2)
        self.assertEqual({x[2] for x in rows},{"광산구청","광주경찰서"})
        self.assertTrue(all(x[3]=="government" for x in rows))

    def test_city_boundary_excludes_damyang_and_private_offices(self):
        poly=[((126.68,35.05,126.90,35.27),[[
            [126.68,35.05],[126.90,35.05],[126.90,35.27],[126.68,35.27],[126.68,35.05]
        ]])]
        payload={"elements":[
            {"lat":35.13,"lon":126.82,"tags":{"name":"광산구청","office":"government"}},
            {"lat":35.175,"lon":127.03,"tags":{"name":"가사문학면사무소","office":"government"}},
            {"lat":35.14,"lon":126.80,"tags":{"name":"민간관리사무소","office":"government"}},
        ]}
        records=gov.osm_rows(payload,poly)
        self.assertEqual([r[2] for r in records],["광산구청"])
        self.assertFalse(gov.inside_gwangju(127.03,35.175,poly))
        self.assertTrue(gov.inside_gwangju(126.82,35.13,poly))

    def test_duplicate_nearby_same_name_collapses(self):
        rows=gov.unique([
            [126.82000,35.1700,"광산구청","government"],
            [126.82004,35.17002,"광산구청","government"],
            [126.91,35.17,"광산구청","government"],
        ])
        self.assertEqual(len(rows),2)

if __name__=="__main__":
    unittest.main()
