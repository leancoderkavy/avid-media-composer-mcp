"""Inspect the retained owned color-refresh fixture without resolving media locators."""
import hashlib
import json
import sys
from pathlib import Path
import avb

assert all(arg=='--pcm' for arg in sys.argv[1:])
PCM = '--pcm' in sys.argv
ROOT = Path('.avid-mcp-analysis/native-color-fixture-3bfb1d55-f1d4-4675-936c-bd2ab3cf8694' if PCM else '.avid-mcp-analysis/native-color-fixture-dccc9bf2-5f8a-46ff-9768-3ec701e901e0')
NAME = 'MCP_PCM_AAF_Selects.Copy.01' if PCM else 'MCP_Sonoma_AAF_Selects.Copy.05.Copy.01'


def inspect(filename):
    digest = hashlib.sha256(filename.read_bytes()).hexdigest()
    count = 0

    def walk(component, depth=0):
        nonlocal count
        count += 1
        if count > 1000 or depth > 16:
            raise ValueError('Fixture traversal exceeded bounds')
        result = {'kind': component.class_id.decode('ascii'), 'rate': component.edit_rate,
                  'length': component.length, 'mediaKind': component.media_kind}
        for key in ('effect_id', 'start_time', 'track_id', 'left_length', 'right_length',
                    'info_is_reversed', 'mc_mode', 'num_scalars'):
            value = getattr(component, key, None)
            if value is not None:
                if not isinstance(value, (str, int, float, bool)):
                    raise ValueError('Unexpected declaration type')
                result[key] = value
        if component.class_id == b'SCLP':
            result['sourceMobId'] = str(component.mob_id)
        for key in ('param_list', 'keyframes'):
            value = getattr(component, key, None)
            result[key] = None if value is None else {'classId': value.class_id.decode('ascii')}
        if component.class_id == b'SEQU':
            result['children'] = [{'offset': offset, 'component': walk(child, depth+1)}
                                  for _, offset, child in component.positions()]
        elif component.class_id == b'TKFX':
            result['children'] = [{'index': track.index, 'component': walk(track.component, depth+1)}
                                  for track in component.tracks]
        return result

    with avb.open(str(filename)) as source:
        matches = [mob for mob in source.content.mobs if mob.name == NAME]
        assert len(matches) == 1
        result = {'sha256': digest, 'tracks': [walk(track.component) for track in matches[0].tracks]}
    assert hashlib.sha256(filename.read_bytes()).hexdigest() == digest
    return result


report = {key: inspect(ROOT / filename) for key, filename in
          [('before', 'candidate-baseline.avb'), ('after', 'candidate-refreshed.avb')]}
with (ROOT / 'adapter-structure.json').open('x', encoding='utf-8') as target:
    json.dump(report, target, indent=2)
print(json.dumps(report))
