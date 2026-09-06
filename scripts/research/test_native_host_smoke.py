"""Fixture-boundary regressions; never construct a live Smoke connection."""

from pathlib import Path
import unittest
from unittest.mock import Mock

from native_host_smoke import Smoke


class FixtureBoundaryTests(unittest.TestCase):
    def fixture(self):
        smoke = Smoke.__new__(Smoke)
        project = (Path.cwd() / "unused-test-fixture" / "Test").resolve()
        smoke.fixture = {"project": str(project), "bin_name": "MCP_Smoke_unit",
                         "bin_path": str(project / "MCP_Smoke_unit.avb"),
                         "created": True, "attempted_stages": [], "mob_id": "owned-clip"}
        smoke.current_project = Mock(return_value=project)
        smoke.call = Mock()
        smoke.save = Mock()
        return smoke

    def test_project_switch_stops_mutations(self):
        smoke = self.fixture()
        smoke.current_project.return_value = Path(smoke.fixture["project"]).parent / "DifferentProject"
        with self.assertRaisesRegex(RuntimeError, "Project changed"):
            smoke.mutate("close")
        smoke.call.assert_not_called()

    def test_fixture_path_escape_is_rejected(self):
        smoke = self.fixture()
        smoke.fixture["bin_path"] = str(Path(smoke.fixture["project"]).parent / "MCP_Smoke_unit.avb")
        with self.assertRaisesRegex(RuntimeError, "Invalid fixture boundary"):
            smoke.mutate("close")
        smoke.call.assert_not_called()

    def test_uncertain_stage_cannot_be_replayed(self):
        smoke = self.fixture()
        smoke.fixture["attempted_stages"] = ["close"]
        with self.assertRaisesRegex(RuntimeError, "already attempted"):
            smoke.mutate("close")
        smoke.call.assert_not_called()

    def test_existing_fixture_cannot_be_recreated(self):
        smoke = self.fixture()
        with self.assertRaisesRegex(RuntimeError, "recreate/overwrite"):
            smoke.mutate("create-project-root")
        smoke.call.assert_not_called()

    def test_extra_clip_stops_marker_write(self):
        smoke = self.fixture()
        smoke.fixture_items = Mock(return_value=[{"mob_id": "owned-clip"}, {"mob_id": "unowned-clip"}])
        with self.assertRaisesRegex(RuntimeError, "ownership/state differs"):
            smoke.mutate("add-point-marker")
        smoke.call.assert_not_called()


if __name__ == "__main__":
    unittest.main()
