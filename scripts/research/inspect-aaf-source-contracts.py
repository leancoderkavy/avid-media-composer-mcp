"""Read-only comparison of the two checksum-selected Sonoma reference AAFs."""
import hashlib
import json
from pathlib import Path
from uuid import uuid4

import aaf2

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = [
    ("older", ".avid-mcp-analysis/native-pcm-aaf-7e173226-261d-4e72-95fb-c2e705dd1a0c/export/PCM_reference.aaf", "5c04dea1552933d8b171af3898e83fcc165709e4f283c1ba9af6b3dc4b66802d"),
    ("newer", ".avid-mcp-analysis/native-aaf-master-mcp-f6012198-7bad-489d-9d85-f4968f0fdcf9/native-export-b38de484-81d0-4bdf-82a5-902d55b122d0/export/reference.aaf", "94ff38c9ac7256254030b3f6b24aa98d28427f5c614791a2e5e3d745423ab66c"),
]


def value(obj, key):
    prop = obj.get(key, None)
    return prop.value if prop is not None else None


def inspect(file):
    with aaf2.open(str(file)) as aaf:
        mobs = []
        for mob in aaf.content.mobs:
            attributes = {
                item.name: item.value for item in mob.get("MobAttributeList", [])
                if item.name.startswith("_SAVED_AAF_") or item.name in ("_CHANNEL_GROUP_LIST", "_ORIGINAL_CHANNEL_GROUP_LIST")
            }
            slots = []
            for slot in mob.slots:
                segment = slot.segment
                clips = list(segment.components) if isinstance(segment, aaf2.components.Sequence) else [segment]
                slots.append({"slotId": slot.slot_id, "kind": segment.media_kind,
                              "rate": str(slot.edit_rate), "length": segment.length,
                              "physicalTrackNumber": value(slot, "PhysicalTrackNumber"),
                              "references": [{"mobId": str(c.mob_id), "slotId": c.slot_id, "start": c.start, "length": c.length}
                                             for c in clips if isinstance(c, aaf2.components.SourceClip)]})
            descriptor = getattr(mob, "descriptor", None)
            descriptor_info = None if descriptor is None else {
                "class": type(descriptor).__name__,
                **{key: str(value(descriptor, key)) for key in ("SampleRate", "Length", "AudioSamplingRate", "Channels", "QuantizationBits")}
            }
            mobs.append({"mobId": str(mob.mob_id), "class": type(mob).__name__, "name": mob.name,
                         "attributes": attributes, "slots": slots, "descriptor": descriptor_info})
        return mobs


reports = []
for label, relative, expected in FIXTURES:
    file = ROOT / relative
    assert hashlib.sha256(file.read_bytes()).hexdigest() == expected
    mobs = inspect(file)
    assert hashlib.sha256(file.read_bytes()).hexdigest() == expected
    reports.append({"label": label, "file": str(file), "sha256": expected, "mobs": mobs, "unchanged": True})
output = ROOT / ".avid-mcp-analysis" / ("aaf-source-contracts-" + str(uuid4()))
output.mkdir()
with (output / "evidence.json").open("x", encoding="utf8") as stream:
    json.dump({"references": reports, "limitation": "Observed metadata differences only; no causal or corrective claim."}, stream, indent=2)
print(output / "evidence.json")
