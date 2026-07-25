import tempfile
import unittest
from pathlib import Path

import aaf2
import avb

from python.avid_inspector import Serializer, analyze_aaf, analyze_bin, probe


class InspectorTests(unittest.TestCase):
    def test_probe_reports_both_backends(self):
        result = probe()
        self.assertTrue(result["ready"])
        self.assertEqual(result["packages"]["pyavb"], "1.4.0")
        self.assertEqual(result["packages"]["pyaaf2"], "1.7.1")

    def test_empty_avb_is_analyzed_read_only(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "Fixture.avb"
            avid_file = avb.open()
            avid_file.write(str(path))
            avid_file.close()
            before = path.read_bytes()

            result = analyze_bin(path, Serializer(max_depth=8, max_items=500))

            self.assertEqual(result["format"], "avb")
            self.assertEqual(result["summary"]["binName"], "Fixture")
            self.assertEqual(result["summary"]["binItems"]["count"], 0)
            self.assertEqual(path.read_bytes(), before)

    def test_minimal_aaf_reports_mobs_without_modification(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "Fixture.aaf"
            with aaf2.open(str(path), "w") as aaf_file:
                mob = aaf_file.create.MasterMob("Fixture Clip")
                aaf_file.content.mobs.append(mob)
            before = path.read_bytes()

            result = analyze_aaf(path, Serializer(max_depth=8, max_items=500))

            self.assertEqual(result["format"], "aaf")
            self.assertEqual(result["summary"]["mobs"]["count"], 1)
            self.assertEqual(result["summary"]["mobs"]["names"], ["Fixture Clip"])
            self.assertEqual(path.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
