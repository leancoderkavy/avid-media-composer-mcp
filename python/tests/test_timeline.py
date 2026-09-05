import sys
import tempfile
import unittest
from pathlib import Path
import avb
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from avid_timeline import index_bin


class TimelineTests(unittest.TestCase):
    def stereo_fixture(self,directory,variation=None):
        target=Path(directory)/'stereo.avb'
        with avb.open() as file:
            mob=file.create.Composition(mob_type='CompositionMob')
            mob.name='Stereo';mob.edit_rate=30;mob.length=60;mob.usage_code=2
            mob.attributes['_START']=10;mob.attributes['_END']=40
            parent=file.create.Track();parent.index=1
            effect=file.create.TrackEffect(edit_rate=30,media_kind='sound')
            effect.effect_id='EFF2_AUDIO_CHANNEL_COMBINER';effect.length=60
            for key,value in dict(left_length=15,right_length=15,info_version=2,info_current=0,info_smooth=0,
                                  info_color_item=1,info_quality=1,info_is_reversed=0,info_aspect_on=False,
                                  keyframes=None,info_force_software=False,info_never_hardware=False).items():
                setattr(effect,key,value)
            for index in [1,2]:
                child=file.create.Track();child.index=index
                clip=file.create.SourceClip(edit_rate=30,media_kind='sound')
                clip.length=60;clip.start_time=2850;clip.track_id=index
                child.component=clip;effect.tracks.append(child)
            if variation:variation(effect)
            parent.component=effect;mob.tracks.append(parent);file.content.add_mob(mob);file.write(str(target))
        return target

    def test_stereo_source_references_are_clipped_and_channel_labeled(self):
        with tempfile.TemporaryDirectory() as directory:
            result=index_bin(self.stereo_fixture(directory))
            self.assertTrue(result['complete'])
            nodes=result['mobs'][0]['tracks'][0]['nodes']
            self.assertEqual([(n['timelineStart'],n['timelineEnd'],n['sourceStart'],n['sourceTrackId'],n['channelCombiner']) for n in nodes],
                             [(0,30,2860,1,{'channelIndex':1,'channelCount':2}),(0,30,2860,2,{'channelIndex':2,'channelCount':2})])
            with self.assertRaisesRegex(ValueError,'limit'):index_bin(self.stereo_fixture(directory),2)

    def test_unqualified_channel_effects_remain_opaque(self):
        variations=[lambda e:setattr(e,'effect_id','OTHER_EFFECT'),lambda e:setattr(e,'info_is_reversed',1),
                    lambda e:setattr(e.tracks[1],'index',1),lambda e:setattr(e.tracks[1].component,'length',59),
                    lambda e:setattr(e.tracks[1].component,'edit_rate',24),lambda e:e.tracks.pop()]
        for variation in variations:
            with self.subTest(variation=variation),tempfile.TemporaryDirectory() as directory:
                result=index_bin(self.stereo_fixture(directory,variation))
                self.assertFalse(result['complete'])
                self.assertEqual(result['warnings'][0]['code'],'OPAQUE_COMPONENT')
                nodes=result['mobs'][0]['tracks'][0]['nodes']
                self.assertEqual(len(nodes),1);self.assertTrue(nodes[0]['opaque'])
                self.assertNotIn('sourceMobId',nodes[0])

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
