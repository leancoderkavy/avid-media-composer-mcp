"""Bounded read-only declarations of parameters in the owned refreshed fixture."""
import hashlib
import json
import math
import uuid
from pathlib import Path
import avb

root = Path('.avid-mcp-analysis/native-color-fixture-dccc9bf2-5f8a-46ff-9768-3ec701e901e0')
source = root / 'candidate-refreshed.avb'
digest = hashlib.sha256(source.read_bytes()).hexdigest()
assert digest == 'ddd4ae79e3863dd4d92cd89c70a9d537c21e8b6cd00efd8dc1b35c940dc29ca5'
budget = 0


def describe(value, depth=0):
    global budget
    budget += 1
    if budget > 10000 or depth > 16:
        raise ValueError('Parameter graph limit exceeded')
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            raise ValueError('Nonfinite declaration')
        return value
    if isinstance(value, str):
        if len(value) > 4096:
            raise ValueError('Oversized string declaration')
        return value
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (bytes, bytearray)):
        return {'bytes': len(value), 'sha256': hashlib.sha256(value).hexdigest()}
    if isinstance(value, (list, tuple)):
        if len(value) > 1000:
            raise ValueError('Oversized parameter collection')
        return [describe(item, depth+1) for item in value]
    properties = getattr(value, 'property_data', None)
    if properties is not None:
        return {'class': type(value).__name__, 'properties':
                {key: describe(item, depth+1) for key, item in properties.items()}}
    raise ValueError('Unsupported parameter type: '+type(value).__name__)


with avb.open(str(source)) as file:
    sequence = next(mob for mob in file.content.mobs if mob.name == 'MCP_Sonoma_AAF_Selects.Copy.05.Copy.01')
    effects = [child for _, _, child in sequence.tracks[0].component.positions() if child.class_id == b'TKFX']
    assert len(effects) == 2
    result = [{'id': effect.effect_id, 'parameters': describe(effect.param_list),
               'keyframes': describe(effect.keyframes)} for effect in effects]
assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
with (root / 'color-parameter-declarations.json').open('x', encoding='utf-8') as target:
    json.dump({'sourceSha256': digest, 'effects': result, 'unchanged': True}, target, indent=2)
print(json.dumps(result))
