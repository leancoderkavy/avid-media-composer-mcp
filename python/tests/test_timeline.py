import sys
import tempfile
import unittest
from pathlib import Path
import avb
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from avid_timeline import index_bin, descriptor_metadata, linear_lut_declaration, color_declaration, parameter_fingerprint, color_adapter_input
from unittest.mock import patch
from types import SimpleNamespace


class TimelineTests(unittest.TestCase):
    def test_color_input_reference_requires_single_equal_length_picture_source(self):
        clip=SimpleNamespace(class_id=b'SCLP',media_kind='picture',edit_rate=30,length=60,start_time=2850,track_id=1,mob_id='source')
        filler=SimpleNamespace(class_id=b'FILL',media_kind='picture',edit_rate=30,length=0)
        sequence=SimpleNamespace(class_id=b'SEQU',media_kind='picture',edit_rate=30,length=60,components=[filler,clip,filler])
        effect=SimpleNamespace(class_id=b'TKFX',media_kind='picture',edit_rate=30,length=60,info_is_reversed=0,mc_mode=0,num_scalars=0,tracks=[SimpleNamespace(index=1,component=sequence)])
        with patch('avid_timeline.color_declaration',return_value={}):
            self.assertEqual(color_adapter_input(effect),{'sourceMobId':'source','sourceTrackId':1,'sourceStart':2850,'length':60,'rate':30.0,'basis':'declared-equal-length-input'})
            for obj,key,value in [(effect,'info_is_reversed',1),(effect,'mc_mode',1),(effect,'num_scalars',1),
                                  (sequence,'edit_rate',24),(sequence,'length',59),(clip,'length',59),
                                  (clip,'class_id',b'TKFX'),(clip,'start_time',-1),(clip,'media_kind','sound'),
                                  (filler,'length',1),(sequence,'components',[clip,clip]),(effect,'tracks',[])]:
                old=getattr(obj,key);setattr(obj,key,value)
                self.assertIsNone(color_adapter_input(effect),(key,value));setattr(obj,key,old)
        with patch('avid_timeline.color_declaration',return_value=None):self.assertIsNone(color_adapter_input(effect))

    def test_parameter_fingerprints_detect_payload_changes_and_fail_closed(self):
        with avb.open() as file:
            value=file.create.CFUserParam()
            value.byte_order=18761;value.data=bytearray(b'original')
            first=parameter_fingerprint(value)
            self.assertEqual(first['schema'],1)
            self.assertEqual(parameter_fingerprint(value),first)
            value.data=bytearray(b'changed')
            self.assertNotEqual(parameter_fingerprint(value),first)
            value.data=bytearray(b'original');self.assertEqual(parameter_fingerprint(value),first)
            # A fresh object with reversed assignment order has identical declared data.
            copy=file.create.CFUserParam();copy.data=value.data;copy.byte_order=value.byte_order
            self.assertEqual(parameter_fingerprint(copy),first)
        cycle=[];cycle.append(cycle)
        for unsupported in [None,object(),cycle,[0]*1025,b'x'*1048577,'x'*4097,float('inf'),2**64]:
            self.assertIsNone(parameter_fingerprint(unsupported))
        self.assertNotEqual(parameter_fingerprint([1]),parameter_fingerprint([True]))

    def test_linear_lut_declarations_are_bounded_and_not_xml_execution(self):
        xml=b'<ColorTransformationList><ColorTransformation><LinearLut><Name>Levels scaling (full range to video levels)</Name><BitDepth>10</BitDepth><Black>64</Black><White>940</White><Inverted/></LinearLut></ColorTransformation></ColorTransformationList>\x00'
        expected={'name':'Levels scaling (full range to video levels)','bitDepth':10,'black':64,'white':940,'invertedFlagPresent':True}
        self.assertEqual(linear_lut_declaration(xml),expected)
        automatic=xml.replace(b'<ColorTransformationList>',b'<ColorTransformationList automaticConversion="true"><Name>From Rec.709 [full range] to Rec.709</Name>')
        self.assertEqual(linear_lut_declaration(automatic),{**expected,'automaticConversion':True,'transformationListName':'From Rec.709 [full range] to Rec.709'})
        for bad in [automatic.replace(b'="true"',b'="false"'),automatic.replace(b'<Name>From',b'<Other>From'),automatic.replace(b'automaticConversion=',b'unknown=')]:
            self.assertIsNone(linear_lut_declaration(bad))
        for bad in [b'<!DOCTYPE x>'+xml, b'<?xml version="1.0"?>'+xml, b'x'*65537,
                    xml.replace(b'940',b'1024'),xml.replace(b'64',b'940'),xml.replace(b'>10<',b'>33<'),
                    xml.replace(b'<Inverted/>',b'<Inverted>yes</Inverted>'),
                    xml.replace(b'<Inverted/>',b'<Unknown/>'),xml.replace(b'<Black>',b'<Black x="1">'),
                    xml.replace(b'<Inverted/>',b'<Inverted/><Inverted/>'),b'\xff',xml+b'\x00']:
            with self.subTest(bad=bad[:60]):self.assertIsNone(linear_lut_declaration(bad))
        parameter=SimpleNamespace(uuid='bd7f5cd8-15fd-424e-a34d-11642fbbb867',value_type=4,enable=True,control_track=None,
                                  value=SimpleNamespace(uuid='219a99cc-2c8b-4224-86fe-c05794055e1d',data=xml))
        effect=SimpleNamespace(effect_id='EFF2_LUTSFX',param_list=[parameter])
        self.assertEqual(color_declaration(effect),expected)
        parameter.enable=False;self.assertIsNone(color_declaration(effect))
        parameter.enable=True;effect.param_list.append(parameter);self.assertIsNone(color_declaration(effect))

    def test_saved_descriptor_and_locator_declarations_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'descriptor.avb'
            with avb.open() as file:
                mob=file.create.Composition(mob_type='SourceMob')
                mob.name='Descriptor fixture';mob.edit_rate=30;mob.length=60
                descriptor=file.create.MediaFileDescriptor()
                descriptor.edit_rate=48000;descriptor.length=96000
                locator=file.create.WinFileLocator();locator.path=r'Z:\offline\not-opened.wav'
                descriptor.locator=locator;mob.descriptor=descriptor
                file.content.add_mob(mob);file.write(str(target))
            result=index_bin(target)['mobs'][0]['descriptor']
            self.assertEqual(result['classId'],'MDFL')
            self.assertEqual(result['values']['edit_rate'],48000)
            self.assertEqual(result['values']['length'],96000)
            self.assertEqual(result['locator'],{'classId':'WINF','paths':[{'field':'path','value':r'Z:\offline\not-opened.wav'}]})

    def test_descriptor_metadata_bounds_and_absence(self):
        self.assertIsNone(descriptor_metadata(None))
        for value in (float('nan'),float('inf'),2**53,True):
            with self.subTest(value=value),self.assertRaisesRegex(ValueError,'numeric'):
                descriptor_metadata(SimpleNamespace(class_id=b'MDFL',length=value))
        with self.assertRaisesRegex(ValueError,'locator'):
            descriptor_metadata(SimpleNamespace(class_id=b'MDES',locator=SimpleNamespace(class_id=b'WINF',path='x'*4097)))

    def transition_fixture(self,directory):
        target=Path(directory)/'transition.avb'
        with avb.open() as file:
            mob=file.create.Composition(mob_type='CompositionMob')
            mob.name='Transition';mob.edit_rate=30;mob.length=110
            track=file.create.Track();track.index=1
            sequence=file.create.Sequence(edit_rate=30,media_kind='picture')
            first=file.create.SourceClip(edit_rate=30,media_kind='picture');first.length=60;first.start_time=1000;first.track_id=1
            second=file.create.SourceClip(edit_rate=30,media_kind='picture');second.length=60;second.start_time=2000;second.track_id=1
            effect=file.create.TransitionEffect(edit_rate=30,media_kind='picture');effect.length=10
            for key,value in dict(cutpoint=5,left_length=5,right_length=5,info_version=2,info_current=0,info_smooth=0,
                                  info_color_item=1,info_quality=1,info_is_reversed=0,info_aspect_on=False,
                                  keyframes=None,info_force_software=False,info_never_hardware=False).items():
                setattr(effect,key,value)
            sequence.components.extend([first,effect,second]);track.component=sequence;mob.tracks.append(track)
            file.content.add_mob(mob);file.write(str(target))
        return target

    def test_transition_overlap_remains_opaque_without_shifting_source_ranges(self):
        with tempfile.TemporaryDirectory() as directory:
            result=index_bin(self.transition_fixture(directory))
            self.assertFalse(result['complete'])
            nodes=result['mobs'][0]['tracks'][0]['nodes']
            self.assertEqual([(n['kind'],n['timelineStart'],n['timelineEnd']) for n in nodes],
                             [('SCLP',0,60),('TNFX',50,60),('SCLP',50,110)])
            self.assertTrue(nodes[1]['opaque'])
            self.assertEqual([n['sourceStart'] for n in nodes if 'sourceStart' in n],[1000,2000])

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
                self.assertIn('effect',nodes[0])
                self.assertFalse(nodes[0]['effect']['hasKeyframes'])

    def test_effect_identifier_bounds_and_saved_declaration(self):
        with tempfile.TemporaryDirectory() as directory:
            result=index_bin(self.stereo_fixture(directory,lambda e:setattr(e,'effect_id','EFF2_LUTSFX')))
            node=result['mobs'][0]['tracks'][0]['nodes'][0]
            self.assertEqual(node['effect'],{'id':'EFF2_LUTSFX','hasParameters':False,'hasKeyframes':False})
            self.assertTrue(node['opaque'])
            self.assertNotIn('sourceStart',node)
            with self.assertRaisesRegex(ValueError,'effect identifier'):
                index_bin(self.stereo_fixture(directory,lambda e:setattr(e,'effect_id','x'*1025)))

    def fixture(self,directory,mixed=False):
        target=Path(directory)/'fixture.avb'
        with avb.open() as file:
            mob=file.create.Composition(mob_type='CompositionMob')
            mob.name='Subclip';mob.edit_rate=30;mob.length=300;mob.usage_code=2
            mob.attributes['_START']=90;mob.attributes['_END']=150
            track=file.create.Track();track.index=1
            sequence=file.create.Sequence(edit_rate=30,media_kind='picture')
            first=file.create.SourceClip(edit_rate=30,media_kind='picture');first.length=120;first.start_time=1000;first.track_id=1
            if mixed is True:first.edit_rate=24
            second=file.create.SourceClip(edit_rate=30,media_kind='picture');second.length=180;second.start_time=2000;second.track_id=1
            if mixed=='second':second.edit_rate=24
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

    def test_mixed_rate_component_is_omitted_with_rate_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            result=index_bin(self.fixture(directory,mixed=True))
            self.assertFalse(result['complete'])
            warning=result['warnings'][0]
            self.assertEqual((warning['code'],warning['mobRate'],warning['componentRate']),('MIXED_EDIT_RATE',30,24))
            self.assertEqual(result['mobs'][0]['tracks'][0]['nodes'],[])
            self.assertEqual(result['warnings'][1]['code'],'UNRESOLVED_SEQUENCE_OFFSETS')

    def test_known_prefix_survives_but_nested_uncertainty_stops_later_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            result=index_bin(self.fixture(directory,mixed='second'))
            nodes=result['mobs'][0]['tracks'][0]['nodes']
            self.assertEqual([(n['timelineStart'],n['timelineEnd'],n['sourceStart']) for n in nodes],[(0,30,1090)])
            self.assertFalse(result['complete'])
            original=self.fixture(directory,mixed=True)
            nested=Path(directory)/'nested.avb'
            with avb.open(str(original)) as file:
                mob=list(file.content.mobs)[0]
                outer=file.create.Sequence(edit_rate=30,media_kind='picture')
                outer.components.append(mob.tracks[0].component)
                later=file.create.SourceClip(edit_rate=30,media_kind='picture');later.length=30;later.start_time=3000;later.track_id=1
                outer.components.append(later);mob.tracks[0].component=outer
                mob.length=330;mob.attributes['_END']=330;file.write(str(nested))
            result=index_bin(nested)
            self.assertEqual(result['mobs'][0]['tracks'][0]['nodes'],[])
            self.assertEqual(sum(w['code']=='UNRESOLVED_SEQUENCE_OFFSETS' for w in result['warnings']),2)

    def test_traversal_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError,'limit'):
                index_bin(self.fixture(directory),1)


if __name__=='__main__':unittest.main()
