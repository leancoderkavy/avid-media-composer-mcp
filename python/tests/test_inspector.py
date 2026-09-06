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



class InspectorConsoleEncodingTests(unittest.TestCase):
    def test_unicode_result_is_valid_json_on_a_windows_legacy_stream(self):
        import io
        import json
        from unittest.mock import patch
        from python.avid_inspector import main
        buffer = io.BytesIO()
        output = io.TextIOWrapper(buffer, encoding="cp1252")
        expected = {"name": "葡萄園 🎬", "metadata": {"字幕": "café"}}
        with patch("sys.argv", ["inspector", "probe"]), patch("sys.stdout", output), patch("python.avid_inspector.probe", return_value=expected):
            code = main()
            output.flush()
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(buffer.getvalue().decode("ascii")), expected)

    def test_unicode_error_is_valid_json_on_a_windows_legacy_stream(self):
        import io
        import json
        from unittest.mock import patch
        from python.avid_inspector import main
        buffer = io.BytesIO()
        output = io.TextIOWrapper(buffer, encoding="cp1252")
        with patch("sys.argv", ["inspector", "probe"]), patch("sys.stdout", output), patch("python.avid_inspector.probe", side_effect=ValueError("無法讀取 🎬")):
            code = main()
            output.flush()
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(buffer.getvalue().decode("ascii"))["error"]["message"], "無法讀取 🎬")


if __name__ == "__main__":
    unittest.main()
