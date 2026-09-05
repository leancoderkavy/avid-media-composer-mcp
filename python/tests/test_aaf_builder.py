import unittest
import tempfile
import sys
import hashlib
from pathlib import Path
import aaf2
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from avid_aaf_builder import inspect,build

class AafBuilderTests(unittest.TestCase):
    def fixture(self,root):
        source=root/'source.aaf'
        with aaf2.open(str(source),'w') as f:
            origin=f.create.SourceMob('origin');origin.descriptor=f.create.ImportDescriptor()
            locator=f.create.NetworkLocator();locator['URLString'].value=(root/'media.mp4').as_uri();origin.descriptor['Locator'].append(locator);f.content.mobs.append(origin)
            master=f.create.MasterMob('source');f.content.mobs.append(master)
            for slot_id,kind in [(1,'picture'),(2,'sound')]:
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

if __name__=='__main__':unittest.main()
