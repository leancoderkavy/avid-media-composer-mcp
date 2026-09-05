import sys
import tempfile
import unittest
from pathlib import Path
import avb
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from avid_timeline import index_bin


class TimelineTests(unittest.TestCase):
    def fixture(self,directory):
        target=Path(directory)/'fixture.avb'
        with avb.open() as file:
            mob=file.create.Composition(mob_type='CompositionMob')
            mob.name='Subclip';mob.edit_rate=30;mob.length=300;mob.usage_code=2
            mob.attributes['_START']=90;mob.attributes['_END']=150
            track=file.create.Track();track.index=1
            sequence=file.create.Sequence(edit_rate=30,media_kind='picture')
            first=file.create.SourceClip(edit_rate=30,media_kind='picture');first.length=120;first.start_time=1000;first.track_id=1
            second=file.create.SourceClip(edit_rate=30,media_kind='picture');second.length=180;second.start_time=2000;second.track_id=1
            sequence.components.extend([first,second]);track.component=sequence;mob.tracks.append(track)
            file.content.add_mob(mob);file.write(str(target))
        return target

    def test_subclip_bounds_and_source_overlap(self):
        with tempfile.TemporaryDirectory() as directory:
            result=index_bin(self.fixture(directory))
            self.assertTrue(result['complete'])
            mob=result['mobs'][0]
            self.assertEqual(mob['duration'],60)
            nodes=mob['tracks'][0]['nodes']
            self.assertEqual([(n['timelineStart'],n['timelineEnd'],n['sourceStart']) for n in nodes],[(0,30,1090),(30,60,2000)])

    def test_traversal_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError,'limit'):
                index_bin(self.fixture(directory),1)


if __name__=='__main__':unittest.main()
