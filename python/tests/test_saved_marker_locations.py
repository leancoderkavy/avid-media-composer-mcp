from pathlib import Path
from types import SimpleNamespace as Obj
import unittest
import tempfile
import avb
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from avid_markers import saved_markers
from avid_timeline import index_bin
import avid_markers as research
from unittest.mock import patch



class SavedMarkerLocationTests(unittest.TestCase):
    def test_saved_avb_marker_roundtrip_and_limits(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'markers.avb'
            with avb.open() as file:
                mob = file.create.Composition(mob_type='CompositionMob')
                mob.name = 'Marker fixture'; mob.edit_rate = 30; mob.length = 60
                clip = file.create.SourceClip(media_kind='picture'); clip.edit_rate = 30; clip.length = 60
                track = file.create.Track(); track.index = 1; track.component = clip; mob.tracks.append(track)
                marker = file.create.Marker(); marker.position = 0; marker.comp_offset = 15
                from avb.mobid import MobID
                marker.mob_id = MobID(); marker.color = [13107, 52428, 13107]
                marker.attributes = file.create.Attributes(); marker.attributes['_ATN_CRM_ID'] = 'legacy-marker'
                marker.attributes['_ATN_CRM_COM'] = 'Reviewed'
                collection = file.create.TimeCrumbList(); collection.append(marker); clip.attributes['_TMP_CRM'] = collection
                file.content.add_mob(mob); file.write(str(target))
            result = index_bin(target)['mobs'][0]['markers']
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]['comment'], 'Reviewed')
            self.assertEqual(result[0]['id'], 'legacy-marker')
            self.assertIsNone(result[0]['guid'])
            self.assertEqual(result[0]['location']['sequenceFrame'], 15)
            with avb.open(str(target)) as file:
                mob = next(iter(file.content.mobs))
                with self.assertRaises(ValueError): saved_markers(mob, {'nodes': 100000, 'markers': 0})
                with self.assertRaises(ValueError): saved_markers(mob, {'nodes': 0, 'markers': 10000})
    def fixture(self):
        marker = Obj(comp_offset=15)
        leaf = Obj(class_id=b'SCLP', length=60, edit_rate=30, attributes={'_TMP_CRM': [marker]})
        first = Obj(class_id=b'SCLP', length=60, edit_rate=30)
        sequence = Obj(class_id=b'SEQU', length=120, edit_rate=30, components=[first, leaf])
        mob = Obj(mob_id='mob', edit_rate=30, length=120, usage_code=0, attributes={},
                  tracks=[Obj(index=1, media_kind='picture', component=sequence)])
        path = ['mob', 'tracks', '0', 'component', 'components', '1', 'attributes', '_TMP_CRM', '0']
        return mob, path, marker, sequence, first, leaf

    def test_direct_offsets_and_subclip_bounds(self):
        mob, path, marker, sequence, first, leaf = self.fixture()
        result = research.marker_location(mob, path, marker)
        self.assertEqual(result['sequenceFrame'], 75)
        self.assertEqual(result['status'], 'direct_sequence')
        marker.comp_offset = 0
        self.assertEqual(research.marker_location(mob, path, marker)['sequenceFrame'], 60)
        mob.usage_code = 2
        mob.attributes = {'_START': 60, '_END': 100}
        self.assertEqual(research.marker_location(mob, path, marker)['sequenceFrame'], 0)
        mob.attributes['_START'] = 61
        self.assertIsNone(research.marker_location(mob, path, marker)['sequenceFrame'])

    def test_unsupported_positions_remain_unresolved(self):
        mob, path, marker, sequence, first, leaf = self.fixture()
        for obj, key, value, reason in [
            (first, 'edit_rate', 24, 'mixed_edit_rate'),
            (leaf, 'edit_rate', 24, 'mixed_edit_rate'),
            (first, 'class_id', b'TNFX', 'transition_overlap'),
            (sequence, 'length', 121, 'sequence_length_mismatch'),
            (first, 'length', -1, 'invalid_component_length'),
            (marker, 'comp_offset', 60, 'invalid_component_offset'),
            (marker, 'comp_offset', -1, 'invalid_component_offset'),
            (marker, 'comp_offset', True, 'invalid_component_offset')]:
            with self.subTest(reason=reason, field=key):
                previous = getattr(obj, key)
                setattr(obj, key, value)
                result = research.marker_location(mob, path, marker)
                self.assertIsNone(result['sequenceFrame'])
                self.assertEqual(result['reason'], reason)
                setattr(obj, key, previous)
        for malformed in [[], path[:-1], path + ['extra'], ['other'] + path[1:], path[:2] + ['-1'] + path[3:]]:
            self.assertIsNone(research.marker_location(mob, malformed, marker)['sequenceFrame'])

    def test_effect_input_retains_uncertainty_and_unknown_effect_refuses(self):
        mob, path, marker, sequence, first, leaf = self.fixture()
        effect = Obj(class_id=b'TKFX', length=60, edit_rate=30, tracks=[Obj(component=leaf)])
        sequence.components[1] = effect
        path = path[:6] + ['tracks', '0', 'component'] + path[6:]
        with patch('avid_markers.color_adapter_input', return_value={'basis': 'declared-equal-length-input'}):
            result = research.marker_location(mob, path, marker)
            self.assertEqual(result['sequenceFrame'], 75)
            self.assertEqual(result['status'], 'declared_effect_input')
            self.assertEqual(result['effectInputsCrossed'], 1)
        with patch('avid_markers.color_adapter_input', return_value=None):
            result = research.marker_location(mob, path, marker)
            self.assertEqual(result['reason'], 'opaque_effect')
            self.assertIsNone(result['sequenceFrame'])


if __name__ == '__main__':
    unittest.main()
