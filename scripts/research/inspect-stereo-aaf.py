"""Inspect the exact native-exported stereo composition without modifying it."""
import hashlib
import json
from pathlib import Path
from uuid import uuid4
import aaf2

root = Path(__file__).resolve().parents[2]
file = root / '.avid-mcp-analysis/native-pcm-aaf-3fb9b57b-f003-410c-88e4-30d808dbd42d/export/PCM_reference.aaf'
expected = 'd85fc7de888a3a0700a62b605e92578d5d9862df3798ae705d18a71638556c6a'
assert hashlib.sha256(file.read_bytes()).hexdigest() == expected

def scalar(value):
    if isinstance(value, (bytes, bytearray)): return {'hex': value.hex()}
    if isinstance(value, list): return [scalar(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None: return value
    return str(value)

with aaf2.open(str(file)) as aaf:
    compositions = list(aaf.content.compositionmobs())
    assert len(compositions) == 1
    composition = compositions[0]
    sound = [s for s in composition.slots if s.segment.media_kind.lower() == 'sound']
    assert len(sound) == 1
    slot = sound[0]
    attrs = {t.name: scalar(t.value) for t in slot.get('TimelineMobAttributeList', [])}
    assert attrs['_TRACK_FORMAT'] == 2
    cuts = []
    for component in slot.segment.components:
        assert isinstance(component, aaf2.components.OperationGroup)
        operation = component.operation
        assert str(operation.auid) == '6b46dd7a-132d-4856-ab21-8b751d8462ec'
        inputs = list(component.segments)
        assert len(inputs) == 2 and all(isinstance(c, aaf2.components.SourceClip) for c in inputs)
        cuts.append({'operationId': str(operation.auid), 'operationName': operation.name,
                     'length': component.length,
                     'parameters': [{'definition': str(p['Definition'].value), 'value': scalar(p['Value'].value)} for p in component.parameters],
                     'inputs': [{'mobId': str(c.mob_id), 'slotId': c.slot_id, 'start': c.start, 'length': c.length} for c in inputs]})
    assert len(cuts) == 2
    for cut, start in zip(cuts, [2850, 3300]):
        assert cut['length'] == 60
        assert [(c['slotId'], c['start'], c['length']) for c in cut['inputs']] == [(2, start, 60), (3, start, 60)]
assert hashlib.sha256(file.read_bytes()).hexdigest() == expected
directory = root / '.avid-mcp-analysis' / ('stereo-aaf-structure-' + str(uuid4()))
directory.mkdir()
with (directory / 'evidence.json').open('x', encoding='utf8') as stream:
    json.dump({'file': str(file), 'sha256': expected, 'slotAttributes': attrs, 'cuts': cuts,
               'unchanged': True, 'limitation': 'Observed native export; independently authored import and render remain unverified.'}, stream, indent=2)
print(directory / 'evidence.json')
