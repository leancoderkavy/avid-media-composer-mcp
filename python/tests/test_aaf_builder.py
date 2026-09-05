import unittest
import tempfile
import sys
import hashlib
from pathlib import Path
import aaf2
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from avid_aaf_builder import inspect,build,inspect_selects

class AafBuilderTests(unittest.TestCase):
    def fixture(self,root):
        source=root/'source.aaf'
        with aaf2.open(str(source),'w') as f:
            origin=f.create.SourceMob('origin');origin.descriptor=f.create.ImportDescriptor()
            locator=f.create.NetworkLocator();locator['URLString'].value=(root/'media.mp4').as_uri();origin.descriptor['Locator'].append(locator);f.content.mobs.append(origin)
            master=f.create.MasterMob('source');f.content.mobs.append(master)
            for slot_id,kind in [(1,'picture'),(2,'sound'),(3,'sound')]:
                slot=master.create_empty_sequence_slot(30,slot_id=slot_id,media_kind=kind);slot.segment.components.append(f.create.SourceClip(media_kind=kind,length=120));slot.segment.length=120
            mob_id=str(master.mob_id)
        return {'source':str(source),'output':str(root/'output.aaf'),'expectedSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'rate':'30','name':'Selects','tracks':[{'name':'V1','kind':'picture'},{'name':'A1','kind':'sound'}],'selects':[{'mobId':mob_id,'start':20,'length':30,'slotIds':[1,2]},{'mobId':mob_id,'start':70,'length':20,'slotIds':[1,2]}]}
    def test_build_preserves_source_and_reopens_exact_cuts(self):
        with tempfile.TemporaryDirectory() as folder:
            request=self.fixture(Path(folder));info=inspect(request['source']);self.assertEqual(len(info['locators']),1)
            result=build(request);self.assertEqual(result['frames'],50);self.assertTrue(result['conformanceVerified']);self.assertFalse(result['hostImportVerified'])
            self.assertEqual(hashlib.sha256(Path(request['source']).read_bytes()).hexdigest(),request['expectedSha256'])
            with self.assertRaises(FileExistsError):build(request)
    def test_invalid_mappings_rates_ranges_and_checksum_leave_no_output(self):
        for change in [{'rate':'24'},{'expectedSha256':'0'*64},{'selects':[{'mobId':'missing','start':0,'length':1,'slotIds':[1,2]}]}]:
            with tempfile.TemporaryDirectory() as folder:
                request=self.fixture(Path(folder));request.update(change)
                with self.assertRaises(ValueError):build(request)
                self.assertFalse(Path(request['output']).exists())
        with tempfile.TemporaryDirectory() as folder:
            request=self.fixture(Path(folder));request['selects'][0]['start']=119
            with self.assertRaises(ValueError):build(request)
            self.assertFalse(Path(request['output']).exists())

    def test_selects_inspection_reads_each_track_and_preserves_file(self):
        with tempfile.TemporaryDirectory() as folder:
            request=self.fixture(Path(folder));build(request)
            file=Path(request['output']);before=file.read_bytes()
            info=inspect_selects(file);composition=info['composition']
            self.assertEqual((composition['frames'],composition['rate']),(50,'30'))
            self.assertEqual([t['kind'] for t in composition['tracks']],['picture','sound'])
            for track in composition['tracks']:
                self.assertEqual([(c['position'],c['start'],c['length']) for c in track['cuts']],[(0,20,30),(30,70,20)])
                self.assertEqual([c['slotId'] for c in track['cuts']],[track['slotId']]*2)
            self.assertEqual(file.read_bytes(),before)
            with self.assertRaisesRegex(ValueError,'exactly one'):inspect_selects(request['source'])
            with self.assertRaisesRegex(ValueError,'without existing compositions'):inspect(file)

    def test_selects_inspection_refuses_unsupported_or_inconsistent_graphs(self):
        for change in ['rate','origin','filler','range','length','multiple','source_slot']:
            with self.subTest(change=change),tempfile.TemporaryDirectory() as folder:
                request=self.fixture(Path(folder));build(request);file=Path(request['output'])
                with aaf2.open(str(file),'rw') as f:
                    composition=next(f.content.compositionmobs());slot=next(iter(composition.slots));segment=slot.segment
                    if change=='rate':slot.edit_rate=24
                    elif change=='origin':slot.origin=1
                    elif change=='filler':segment.components[0]=f.create.Filler(media_kind='picture',length=30)
                    elif change=='range':segment.components[0].start=119
                    elif change=='length':segment.length=51
                    elif change=='multiple':f.content.mobs.append(f.create.CompositionMob('second'))
                    elif change=='source_slot':segment.components[0].slot_id=99
                before=file.read_bytes()
                with self.assertRaises(ValueError):inspect_selects(file)
                self.assertEqual(file.read_bytes(),before)

    def stereo(self,root):
        request=self.fixture(root);request['tracks'][1]['channels']=2
        for select in request['selects']:select['slotIds']=[1,[2,3]]
        return request

    def test_stereo_build_and_inspect_preserve_both_channel_ranges(self):
        with tempfile.TemporaryDirectory() as folder:
            request=self.stereo(Path(folder));build(request)
            track=inspect_selects(request['output'])['composition']['tracks'][1]
            self.assertEqual(track['channels'],2)
            self.assertEqual([(c['channelIndex'],c['slotId'],c['position'],c['start'],c['length']) for c in track['cuts']],
                             [(1,2,0,20,30),(2,3,0,20,30),(1,2,30,70,20),(2,3,30,70,20)])
            self.assertEqual(hashlib.sha256(Path(request['source']).read_bytes()).hexdigest(),request['expectedSha256'])

    def test_stereo_refuses_invalid_mapping_before_output(self):
        for mapping in [2,[2,2],[1,2],[2,99],[2,3,4]]:
            with self.subTest(mapping=mapping),tempfile.TemporaryDirectory() as folder:
                request=self.stereo(Path(folder));request['selects'][0]['slotIds'][1]=mapping
                with self.assertRaises(ValueError):build(request)
                self.assertFalse(Path(request['output']).exists())

    def test_stereo_inspection_rejects_modified_effects_or_unsynchronized_channels(self):
        for change in ['parameter','start','duplicate','length','format','extra_input','unknown_operation']:
            with self.subTest(change=change),tempfile.TemporaryDirectory() as folder:
                request=self.stereo(Path(folder));build(request)
                with aaf2.open(request['output'],'rw') as f:
                    slot=list(next(f.content.compositionmobs()).slots)[1];component=slot.segment.components[0]
                    if change=='parameter':list(component.parameters)[0]['Value'].value=0
                    elif change=='start':component.segments[1].start+=1
                    elif change=='duplicate':component.segments[1].slot_id=2
                    elif change=='length':component.segments[1].length-=1
                    elif change=='format':slot['TimelineMobAttributeList'].clear()
                    elif change=='extra_input':component.segments.append(f.create.SourceClip(media_kind='sound',length=30))
                    elif change=='unknown_operation':
                        operation=f.create.OperationDef('11111111-1111-1111-1111-111111111111','Unknown');operation.media_kind='sound';operation.number_inputs=2;f.dictionary.register_def(operation);component.operation=operation
                with self.assertRaises(ValueError):inspect_selects(request['output'])

    def test_inspection_refuses_hidden_fades_and_channel_remapping(self):
        for stereo in [False,True]:
            for key,value in [('FadeInLength',1),('FadeOutLength',1),('ChannelIDs',[2]),('MonoSourceSlotIDs',[3]),('SubclipFullLength',120)]:
                with self.subTest(stereo=stereo,key=key),tempfile.TemporaryDirectory() as folder:
                    request=(self.stereo if stereo else self.fixture)(Path(folder));build(request)
                    with aaf2.open(request['output'],'rw') as f:
                        component=list(next(f.content.compositionmobs()).slots)[1].segment.components[0]
                        clip=component.segments[0] if stereo else component
                        clip[key].value=value
                    before=Path(request['output']).read_bytes()
                    with self.assertRaisesRegex(ValueError,'modifiers or channel remapping'):inspect_selects(request['output'])
                    self.assertEqual(Path(request['output']).read_bytes(),before)

if __name__=='__main__':unittest.main()
