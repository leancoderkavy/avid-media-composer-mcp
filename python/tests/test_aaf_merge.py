import hashlib,shutil,tempfile,unittest,sys
from pathlib import Path
import aaf2
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from avid_aaf_merge import merge
import test_aaf_builder

class AafMergeTests(unittest.TestCase):
    def fixture(self,root):
        request=test_aaf_builder.AafBuilderTests().fixture(root)
        first=Path(request['source']);second=root/'second.aaf';shutil.copyfile(first,second)
        return {'output':str(root/'combined.aaf'),'sources':[{'file':str(p),'expectedSha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [first,second]]}
    def test_duplicate_graphs_remap_all_identities_without_overwriting_sources(self):
        with tempfile.TemporaryDirectory() as folder:
            request=self.fixture(Path(folder));result=merge(request)
            self.assertTrue(result['graphVerified']);self.assertFalse(result['hostImportVerified'])
            self.assertEqual(len(result['inspection']['masters']),2)
            self.assertEqual(result['sources'][0]['remappedMobIds'],{})
            self.assertEqual(len(result['sources'][1]['remappedMobIds']),2)
            before=Path(request['output']).read_bytes()
            with self.assertRaises(ValueError):merge(request)
            self.assertEqual(Path(request['output']).read_bytes(),before)
            for source in request['sources']:self.assertEqual(hashlib.sha256(Path(source['file']).read_bytes()).hexdigest(),source['expectedSha256'])
    def test_invalid_source_sets_and_hashes_leave_no_output(self):
        for mode in ['single','duplicate','hash']:
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as folder:
                request=self.fixture(Path(folder))
                if mode=='single':request['sources'].pop()
                elif mode=='duplicate':request['sources'][1]=request['sources'][0]
                else:request['sources'][1]['expectedSha256']='0'*64
                with self.assertRaises(ValueError):merge(request)
                self.assertFalse(Path(request['output']).exists())
    def test_conflicting_weak_definitions_leave_no_output(self):
        with tempfile.TemporaryDirectory() as folder:
            request=self.fixture(Path(folder));file=Path(request['sources'][1]['file'])
            with aaf2.open(str(file),'rw') as f:
                next(f.content.mastermobs()).slots[0].segment['DataDefinition'].value.name='Changed picture definition'
            request['sources'][1]['expectedSha256']=hashlib.sha256(file.read_bytes()).hexdigest()
            with self.assertRaisesRegex(ValueError,'Conflicting weak'):merge(request)
            self.assertFalse(Path(request['output']).exists())

    def test_colliding_sources_keep_each_masters_distinct_source_slot(self):
        with tempfile.TemporaryDirectory() as folder:
            request=self.fixture(Path(folder));original_ids=[]
            for index,item in enumerate(request['sources']):
                file=Path(item['file'])
                with aaf2.open(str(file),'rw') as f:
                    origin=next(f.content.sourcemobs());master=next(f.content.mastermobs())
                    slot_id=1 if index==0 else 10
                    slot=origin.create_empty_sequence_slot(30,slot_id=slot_id,media_kind='picture')
                    slot.segment.components.append(f.create.SourceClip(media_kind='picture',length=120));slot.segment.length=120
                    clip=master.slots[0].segment.components[0];clip.mob_id=origin.mob_id;clip.slot_id=slot_id
                    original_ids.append((str(master.mob_id),str(origin.mob_id),slot_id))
                item['expectedSha256']=hashlib.sha256(file.read_bytes()).hexdigest()
            result=merge(request)
            with aaf2.open(request['output']) as f:
                mobs={str(m.mob_id):m for m in f.content.mobs}
                resolved=[]
                for index,(master_id,origin_id,slot_id) in enumerate(original_ids):
                    mapping=result['sources'][index]['remappedMobIds']
                    master=mobs[mapping.get(master_id,master_id)]
                    clip=master.slots[0].segment.components[0]
                    self.assertEqual(str(clip.mob_id),mapping.get(origin_id,origin_id))
                    self.assertEqual(clip.slot_id,slot_id)
                    origin=mobs[str(clip.mob_id)]
                    self.assertEqual(next(s for s in origin.slots if s.slot_id==clip.slot_id).segment.length,120)
                    resolved.append(str(clip.mob_id))
                self.assertEqual(len(set(resolved)),2)
            for item in request['sources']:self.assertEqual(hashlib.sha256(Path(item['file']).read_bytes()).hexdigest(),item['expectedSha256'])

    def test_output_change_after_graph_verification_is_not_blessed(self):
        with tempfile.TemporaryDirectory() as folder:
            request=self.fixture(Path(folder));output=Path(request['output'])
            original_inspect=test_aaf_builder.inspect
            def inspect_then_change(file):
                result=original_inspect(file)
                if Path(file)==output:
                    with aaf2.open(str(output),'rw') as f:next(f.content.mastermobs()).name='Changed after graph check'
                return result
            with patch('avid_aaf_builder.inspect',side_effect=inspect_then_change):
                with self.assertRaisesRegex(ValueError,'changed during verification'):merge(request)
            self.assertTrue(output.exists())
            with aaf2.open(str(output)) as f:self.assertEqual(next(f.content.mastermobs()).name,'Changed after graph check')
            for item in request['sources']:self.assertEqual(hashlib.sha256(Path(item['file']).read_bytes()).hexdigest(),item['expectedSha256'])

if __name__=='__main__':unittest.main()
