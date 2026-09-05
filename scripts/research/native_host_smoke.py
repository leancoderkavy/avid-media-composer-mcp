"""Staged native API smoke test, limited to an owned disposable bin.

Run baseline first, then one stage at a time while observing Media Composer.
This is research code, separate from the production MCP and read-only probe.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
import uuid
import wave

from google.protobuf import descriptor_pb2, descriptor_pool, json_format, message_factory

from inspect_mcapi import _loopback_rpc, extract_descriptor, verify_listener_owner


BINARY = Path(r"C:\Program Files\Avid\Avid Media Composer\AvidMediaComposer.exe")
EXPECTED_SHA = "3ca4d082a3afe00a120d6061d6ee94e20e6113238f0b016398700f3439ec9194"
METHODS = frozenset({"GetAppInfo", "GetOpenProjectInfo", "GetBins", "GetBinInfo",
                     "GetListOfBinItems", "CreateBin", "CloseBin", "OpenBin",
                     "GetListOfLinkSettings", "LinkFile", "GetMobInfo", "GetMarkers",
                     "AddMarker", "ChangeMarker", "DeleteMarkers", "LoadMobsIntoViewer"})


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


class Smoke:
    def __init__(self, directory):
        self.directory = directory.resolve()
        self.manifest_path = self.directory / "fixture.json"
        raw = BINARY.read_bytes()
        if hashlib.sha256(raw).hexdigest() != EXPECTED_SHA:
            raise RuntimeError("Host binary differs from the inspected build")
        verify_listener_owner(BINARY.resolve())
        self.pool = descriptor_pool.DescriptorPool()
        self.pool.AddSerializedFile(descriptor_pb2.DESCRIPTOR.serialized_pb)
        for name in ("MCAPI_Types.proto", "MCAPI.proto"):
            self.pool.Add(extract_descriptor(raw, name)[0])
        self.fixture = json.loads(self.manifest_path.read_text()) if self.manifest_path.exists() else None

    def save(self):
        self.manifest_path.write_text(json.dumps(self.fixture, indent=2) + "\n", encoding="utf-8")

    def call(self, method, body=None):
        if method not in METHODS:
            raise ValueError("Method outside smoke-test allowlist")
        request_type = message_factory.GetMessageClass(self.pool.FindMessageTypeByName(f"mcapi.{method}Request"))
        response_type = message_factory.GetMessageClass(self.pool.FindMessageTypeByName(f"mcapi.{method}Response"))
        request = request_type()
        if body:
            json_format.ParseDict({"body": body}, request)
        started = time.monotonic()
        try:
            messages = [response_type.FromString(raw) for raw in _loopback_rpc(method, request.SerializeToString())]
        except Exception as exc:
            with (self.directory / "rpc-receipts.jsonl").open("a", encoding="utf-8") as output:
                output.write(json.dumps({"at": datetime.now(timezone.utc).isoformat(), "method": method,
                                         "elapsed_ms": round((time.monotonic()-started)*1000, 1), "failure": str(exc)}) + "\n")
            raise
        values = [json_format.MessageToDict(m, preserving_proto_field_name=True) for m in messages]
        for value in values:
            value.get("header", {}).pop("task_id", None)
        record = {"at": datetime.now(timezone.utc).isoformat(), "method": method,
                  "elapsed_ms": round((time.monotonic()-started)*1000, 1), "responses": values}
        # Local evidence may contain fixture paths; it stays in the ignored analysis directory.
        with (self.directory / "rpc-receipts.jsonl").open("a", encoding="utf-8") as output:
            output.write(json.dumps(record) + "\n")
        for value in values:
            header = value.get("header", {})
            if "error" in header or header.get("status") in {"Failed", "WaitingForUserInput"}:
                raise RuntimeError(f"{method}: {json.dumps(header)}")
        if not values or values[-1].get("header", {}).get("status") != "Completed":
            raise RuntimeError(f"{method}: no completed application response")
        return [v["body"] for v in values if "body" in v]

    def current_project(self):
        app = self.call("GetAppInfo")
        if len(app) != 1 or app[0].get("app_busy_status", "Idle") != "Idle":
            raise RuntimeError("Editor is not idle")
        project = self.call("GetOpenProjectInfo")
        if len(project) != 1 or not project[0].get("path"):
            raise RuntimeError("Expected an open project")
        return Path(project[0]["path"]).resolve()

    def baseline(self):
        if self.fixture is not None:
            raise RuntimeError("Baseline already exists")
        project = self.current_project()
        if project.name != "Test":
            raise RuntimeError("This investigation is scoped to the observed Test project")
        bins = self.call("GetBins", {"project_path": str(project), "request_flag": ["AllTypes"]})
        name = "MCP_Smoke_" + datetime.now().strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:6]
        self.fixture = {"project": str(project), "bin_name": name,
                        "bin_path": str(project / (name + ".avb")),
                        "binary_sha256": EXPECTED_SHA, "created": False,
                        "original_bins": {b["absolute_path"]: digest(Path(b["absolute_path"])) for b in bins},
                        "attempted_stages": []}
        if Path(self.fixture["bin_path"]).exists():
            raise RuntimeError("Fixture path unexpectedly exists")
        self.save()
        return {"baseline": "captured", "project": project.name, "existing_bins": len(bins), "fixture": name}

    def verify_scope(self):
        if not self.fixture or self.current_project() != Path(self.fixture["project"]):
            raise RuntimeError("Project changed or fixture baseline missing")
        target = Path(self.fixture["bin_path"]).resolve()
        if target.parent != Path(self.fixture["project"]) or target.stem != self.fixture["bin_name"] or not target.stem.startswith("MCP_Smoke_"):
            raise RuntimeError("Invalid fixture boundary")
        return target

    def inspect(self):
        target = self.verify_scope()
        bins = self.call("GetBins", {"project_path": self.fixture["project"], "request_flag": ["AllTypes"]})
        info = self.call("GetBinInfo", {"relative_bin_path": target.name})
        return {"fixture": target.name, "listed": any(Path(b["absolute_path"]).resolve() == target for b in bins),
                "bin_info": info, "file_exists": target.is_file(), "file_sha256": digest(target)}

    def fixture_items(self, target):
        return self.call("GetListOfBinItems", {"bin_relative_path": target.name, "bin_flags": ["AllTypes"]})

    def verify_clip(self, target):
        clip_id = self.fixture.get("mob_id")
        items = self.fixture_items(target)
        if not clip_id or len(items) != 1 or items[0].get("mob_id") != clip_id:
            raise RuntimeError("Fixture clip ownership/state differs from recorded link result")
        return clip_id

    def markers(self, clip_id):
        return [m for b in self.call("GetMarkers", {"mob_id": clip_id}) for m in b.get("info", [])]

    def inspect_clip(self):
        target = self.verify_scope()
        clip_id = self.verify_clip(target)
        metadata = self.call("GetMobInfo", {"mob_id": clip_id})
        visible_columns = {"Name", "Duration", "Start", "End", "Tracks", "Audio SR", "Audio Bit Depth"}
        markers = self.markers(clip_id)
        return {"fixture": target.name, "clip_name": self.fixture_items(target)[0].get("mob_name"),
                "metadata": [x for x in metadata if x.get("column_name") in visible_columns],
                "markers": [{k: v for k, v in m.items() if k in {"comment", "offset", "timecode", "color", "track_label", "name"}} for m in markers]}

    def mutate(self, stage):
        target = self.verify_scope()
        if stage in self.fixture["attempted_stages"]:
            raise RuntimeError("Stage already attempted; inspect outcome instead of replaying")
        creates = stage in {"create", "create-project-root"}
        if creates and (target.exists() or self.fixture["created"]):
            raise RuntimeError("Refusing to recreate/overwrite a fixture")
        if creates:
            existing = self.call("GetBins", {"project_path": self.fixture["project"], "request_flag": ["AllTypes"]})
            if any(Path(b["absolute_path"]).resolve() == target for b in existing):
                raise RuntimeError("Fixture already exists in host state")
        if not creates and not self.fixture["created"]:
            raise RuntimeError("Fixture creation has not completed")
        self.fixture["attempted_stages"].append(stage)
        self.save()
        if creates:
            folder = self.fixture["project"] if stage == "create" else ""
            self.call("CreateBin", {"folder_path": folder, "bin_name": self.fixture["bin_name"], "option": "LastActiveBinContainer"})
            self.fixture["created"] = True
        elif stage in {"close", "persist-close", "cleanup-close", "final-close"}:
            self.call("CloseBin", {"bin_path": str(target)})
        elif stage in {"reopen", "persist-reopen", "cleanup-reopen"}:
            self.call("OpenBin", {"bin_path": str(target)})
        elif stage == "link":
            if self.fixture_items(target):
                raise RuntimeError("Fixture bin must be empty before linking synthetic media")
            self.call("GetListOfLinkSettings")
            media = self.directory / "MCP_SMOKE_SILENCE.wav"
            if media.exists():
                raise RuntimeError("Synthetic media path already exists")
            with wave.open(str(media), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(48000)
                output.writeframes(bytes(48000 * 5 * 2))
            self.fixture["media_sha256"] = digest(media)
            self.save()
            result = self.call("LinkFile", {"file_path": str(media), "destination_bin": target.name})
            if len(result) != 1 or not result[0].get("mob_id"):
                raise RuntimeError("LinkFile did not return one clip ID")
            self.fixture["mob_id"] = result[0]["mob_id"]
        elif stage in {"add-marker", "add-point-marker", "change-marker", "remove-marker", "show-clip"}:
            clip_id = self.verify_clip(target)
            markers = self.markers(clip_id)
            if stage in {"add-marker", "add-point-marker"}:
                if markers:
                    raise RuntimeError("Synthetic clip unexpectedly has markers")
                body = {"mob_id": clip_id, "track_label": {"type": "TRACKTYPE_SOUND", "number": 1},
                        "offset": 30, "color": "Green", "comment": "MCP native API smoke test", "name": "MCP_SMOKE", "user": "MCP Smoke Test"}
                if stage == "add-point-marker":
                    body["length"] = 1
                result = self.call("AddMarker", body)
                if len(result) != 1 or not result[0].get("guid"):
                    raise RuntimeError("AddMarker did not return a marker GUID")
                self.fixture["marker_guid"] = result[0]["guid"]
            elif stage in {"change-marker", "remove-marker"}:
                guid = self.fixture.get("marker_guid")
                if not guid or len(markers) != 1 or markers[0].get("guid") != guid:
                    raise RuntimeError("Marker ownership/state differs from recorded creation result")
                if stage == "change-marker":
                    info = {k: markers[0][k] for k in ("name", "track_label", "user") if k in markers[0]}
                    info.update({"comment": "MCP native API smoke test - edited", "color": "Blue"})
                    self.call("ChangeMarker", {"mob_id": clip_id, "guid": guid, "info": info})
                else:
                    self.call("DeleteMarkers", {"mob_id": clip_id, "guid": [guid]})
            else:
                self.call("LoadMobsIntoViewer", {"mob_ids": [clip_id], "view_type": "Source"})
        self.save()
        return {"stage": stage, **self.inspect()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=["baseline", "create", "create-project-root", "close", "reopen", "inspect",
                                         "link", "inspect-clip", "add-marker", "add-point-marker", "change-marker", "remove-marker", "show-clip",
                                         "persist-close", "persist-reopen", "cleanup-close", "cleanup-reopen", "final-close"])
    parser.add_argument("directory", type=Path, help="New/existing evidence directory within .avid-mcp-analysis")
    args = parser.parse_args()
    root = (Path(__file__).resolve().parents[2] / ".avid-mcp-analysis").resolve()
    directory = args.directory.resolve()
    if directory == root or root not in directory.parents:
        raise RuntimeError("Evidence directory must be beneath the repository's ignored analysis directory")
    directory.mkdir(parents=True, exist_ok=True)
    smoke = Smoke(directory)
    result = smoke.baseline() if args.stage == "baseline" else smoke.inspect() if args.stage == "inspect" else smoke.inspect_clip() if args.stage == "inspect-clip" else smoke.mutate(args.stage)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
