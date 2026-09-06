"""Read-only research inventory of TMBC records and their component paths.

Component offsets are deliberately not presented as sequence-frame positions.
"""
import argparse
import hashlib
import json
from pathlib import Path

import avb


def inspect(filename):
    path = Path(filename).resolve(strict=True)
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    records, references = [], []
    visited = 0
    with avb.open(str(path)) as source:
        for marker in source.iter_class_ids([b'TMBC']):
            if len(records) >= 10000:
                raise ValueError('Marker limit exceeded')
            attrs = dict(marker.attributes.items())
            if any(not isinstance(v, (str, int, bool)) or
                   (isinstance(v, str) and len(v) > 32768) for v in attrs.values()):
                raise ValueError('Unsupported marker attribute')
            records.append({'objectIndex': marker.instance_id,
                            'componentOffset': marker.comp_offset,
                            'position': marker.position,
                            'mobId': str(marker.mob_id),
                            'attributes': attrs, 'rgb16': list(marker.color)})

        def walk(value, location, ancestors, depth=0):
            nonlocal visited
            visited += 1
            if visited > 100000 or depth > 48:
                raise ValueError('Reference traversal limit exceeded')
            if getattr(value, 'class_id', None) == b'TMBC':
                references.append({'objectIndex': value.instance_id, 'path': location})
                return
            if id(value) in ancestors:
                return
            ancestors = ancestors | {id(value)}
            if isinstance(value, dict):
                items = value.items()
            elif isinstance(value, (list, tuple)):
                items = enumerate(value)
            elif hasattr(value, 'property_data'):
                items = value.property_data.items()
            else:
                return
            for key, child in items:
                walk(child, location + [str(key)], ancestors, depth + 1)

        for mob in source.content.mobs:
            walk(mob, [str(mob.mob_id)], set())
    if hashlib.sha256(path.read_bytes()).hexdigest() != before:
        raise ValueError('Input changed during inspection')
    return {'file': str(path), 'sha256': before, 'records': records,
            'references': references, 'sequencePositionsVerified': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file')
    args = parser.parse_args()
    print(json.dumps(inspect(args.file), indent=2))
