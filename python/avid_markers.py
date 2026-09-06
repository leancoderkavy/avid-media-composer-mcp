"""Bounded saved-marker records and declared component locations."""
from avid_timeline import color_adapter_input, stereo_combiner_inputs
import uuid


def saved_markers(mob, budget):
    """Inventory reachable marker occurrences; never interpret unknown positions."""
    records = []

    def walk(value, path, ancestors, depth=0):
        budget['nodes'] += 1
        if budget['nodes'] > 100000 or depth > 48:
            raise ValueError('Saved marker traversal limit exceeded')
        if getattr(value, 'class_id', None) == b'TMBC':
            budget['markers'] += 1
            if budget['markers'] > 10000:
                raise ValueError('Saved marker count limit exceeded')
            attrs = value.attributes
            def text(key, limit):
                result = attrs.get(key)
                if result is not None and (not isinstance(result, str) or len(result) > limit):
                    raise ValueError('Invalid saved marker text')
                return result
            guid = text('_ATN_CRM_ID', 128)
            # Preserve non-UUID legacy identifiers without treating them as native UUIDs.
            try:
                normalized = str(uuid.UUID(guid)) if guid else None
            except ValueError:
                normalized = None
            offset = value.comp_offset
            if isinstance(offset, bool) or not isinstance(offset, int) or not -2147483648 <= offset <= 2147483647:
                raise ValueError('Invalid saved marker component offset')
            rgb = list(value.color)
            if len(rgb) != 3 or any(isinstance(v, bool) or not isinstance(v, int) or not 0 <= v <= 65535 for v in rgb):
                raise ValueError('Invalid saved marker RGB declaration')
            records.append({'id': guid, 'guid': normalized, 'name': text('_ATN_CRM_MARKNAME', 65536),
                            'comment': text('_ATN_CRM_COM', 65536), 'user': text('_ATN_CRM_USER', 4096),
                            'color': text('_ATN_CRM_COLOR', 256), 'rgb16': rgb,
                            'componentOffset': offset, 'path': path,
                            'location': marker_location(mob, path, value)})
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
            label = str(key)
            if len(label) > 256:
                raise ValueError('Saved marker path limit exceeded')
            walk(child, path + [label], ancestors, depth + 1)

    walk(mob, [str(mob.mob_id)], set())
    return records


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
            elif component.class_id == b'TKFX' and path[cursor:cursor + 1] == ['tracks'] and path[cursor + 2:cursor + 3] == ['component']:
                child_index = int(path[cursor + 1])
                if child_index == 0 and color_adapter_input(component) is not None:
                    component = component.tracks[0].component
                else:
                    children = stereo_combiner_inputs(component)
                    if children is None or not 0 <= child_index < len(children):
                        return unresolved('opaque_effect')
                    component = children[child_index].component
                effect_inputs += 1
                cursor += 3
            else:
                return unresolved('unsupported_component_path')
    except (AttributeError, KeyError, IndexError, TypeError, ValueError, OverflowError):
        return unresolved('malformed_component_path')

