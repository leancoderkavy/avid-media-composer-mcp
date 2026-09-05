import hashlib,shutil,tempfile,unittest,sys
from pathlib import Path
import aaf2
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

if __name__=='__main__':unittest.main()
