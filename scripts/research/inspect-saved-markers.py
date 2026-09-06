"""Read-only research inventory of TMBC records and their component paths.

Raw component offsets stay separate from bounded declared sequence locations.
Color-adapter inputs retain an explicit uncertainty status.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import avb
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'python'))
from avid_timeline import color_adapter_input


def marker_location(mob, path, marker):
    """Resolve a declared same-rate path, retaining uncertainty at effect inputs."""
    unresolved = lambda reason: {'status': 'unresolved', 'reason': reason, 'sequenceFrame': None}
    if len(path) < 7 or path[:1] != [str(mob.mob_id)] or path[1] != 'tracks':
        return unresolved('unsupported_owner_path')
    try:
        ordinal = int(path[2])
        if str(ordinal) != path[2] or not 0 <= ordinal < len(mob.tracks) or path[3] != 'component':
            return unresolved('unsupported_track_path')
        track = mob.tracks[ordinal]
        component = track.component
        rate = float(mob.edit_rate)
        if not 0 < rate < 1000:
            return unresolved('invalid_rate')
        position, cursor, effect_inputs = 0, 4, 0
        while True:
            if float(component.edit_rate) != rate:
                return unresolved('mixed_edit_rate')
            length = component.length
            if isinstance(length, bool) or not isinstance(length, int) or length < 0:
                return unresolved('invalid_component_length')
            if path[cursor:cursor + 2] == ['attributes', '_TMP_CRM']:
                if len(path) != cursor + 3:
                    return unresolved('unsupported_marker_path')
                marker_index = int(path[cursor + 2])
                collection = component.attributes['_TMP_CRM']
                if marker_index < 0 or collection[marker_index] is not marker:
                    return unresolved('marker_reference_mismatch')
                offset = marker.comp_offset
                if isinstance(offset, bool) or not isinstance(offset, int) or not 0 <= offset < length:
                    return unresolved('invalid_component_offset')
                start = int(mob.attributes.get('_START', 0)) if mob.usage_code == 2 else 0
                end = int(mob.attributes.get('_END', mob.length)) if mob.usage_code == 2 else mob.length
                frame = position + offset
                if not 0 <= start <= frame < end <= mob.length:
                    return unresolved('outside_mob_bounds')
                return {'status': 'declared_effect_input' if effect_inputs else 'direct_sequence',
                        'sequenceFrame': frame - start, 'trackOrdinal': ordinal,
                        'trackIndex': int(track.index), 'mediaKind': str(track.media_kind),
                        'effectInputsCrossed': effect_inputs, 'rate': rate}
            if component.class_id == b'SEQU' and path[cursor:cursor + 1] == ['components']:
                child_index = int(path[cursor + 1])
                children = list(component.components)
                if not 0 <= child_index < len(children):
                    return unresolved('invalid_child_index')
                if any(child.class_id == b'TNFX' for child in children):
                    return unresolved('transition_overlap')
                if any(float(child.edit_rate) != rate for child in children):
                    return unresolved('mixed_edit_rate')
                if any(isinstance(child.length, bool) or not isinstance(child.length, int) or child.length < 0 for child in children):
                    return unresolved('invalid_component_length')
                if sum(child.length for child in children) != length:
                    return unresolved('sequence_length_mismatch')
                position += sum(child.length for child in children[:child_index])
                component = children[child_index]
                cursor += 2
            elif component.class_id == b'TKFX' and path[cursor:cursor + 3] == ['tracks', '0', 'component']:
                if color_adapter_input(component) is None:
                    return unresolved('opaque_effect')
                component = component.tracks[0].component
                effect_inputs += 1
                cursor += 3
            else:
                return unresolved('unsupported_component_path')
    except (AttributeError, KeyError, IndexError, TypeError, ValueError, OverflowError):
        return unresolved('malformed_component_path')


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

        def walk(value, location, ancestors, mob, depth=0):
            nonlocal visited
            visited += 1
            if visited > 100000 or depth > 48:
                raise ValueError('Reference traversal limit exceeded')
            if getattr(value, 'class_id', None) == b'TMBC':
                references.append({'objectIndex': value.instance_id, 'path': location,
                                   'location': marker_location(mob, location, value)})
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
                walk(child, location + [str(key)], ancestors, mob, depth + 1)

        for mob in source.content.mobs:
            walk(mob, [str(mob.mob_id)], set(), mob)
    if hashlib.sha256(path.read_bytes()).hexdigest() != before:
        raise ValueError('Input changed during inspection')
    return {'file': str(path), 'sha256': before, 'records': records,
            'references': references, 'sequencePositionsVerified': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file')
    args = parser.parse_args()
    print(json.dumps(inspect(args.file), indent=2))
