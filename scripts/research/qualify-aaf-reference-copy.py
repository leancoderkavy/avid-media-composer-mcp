"""Research cross-file reference copying; refuses duplicate identities."""
import hashlib,json,sys,uuid,shutil
from pathlib import Path
import aaf2
from aaf2.mobid import MobID
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'python'))
from avid_aaf_builder import inspect,build,inspect_selects
base=Path(__file__).resolve().parents[2]
fixtures=[
 (base/'.avid-mcp-analysis/native-pcm-aaf-7e173226-261d-4e72-95fb-c2e705dd1a0c/export/PCM_reference.aaf','5c04dea1552933d8b171af3898e83fcc165709e4f283c1ba9af6b3dc4b66802d'),
 (base/'.avid-mcp-analysis/native-aaf-master-mcp-f6012198-7bad-489d-9d85-f4968f0fdcf9/native-export-b38de484-81d0-4bdf-82a5-902d55b122d0/export/reference.aaf','94ff38c9ac7256254030b3f6b24aa98d28427f5c614791a2e5e3d745423ab66c')]
assert all(arg in ['--prepared-reference','--remap-collisions','--slideshow-reference'] for arg in sys.argv[1:])
assert not ('--prepared-reference' in sys.argv and '--slideshow-reference' in sys.argv)
remap='--remap-collisions' in sys.argv
if '--prepared-reference' in sys.argv:
 fixtures[1]=(base/'.avid-mcp-analysis/aaf-workflow-mcp-b53e7873-8af9-4f43-9b86-c7e2039c0d6f/native-export-e5f52871-15a1-4d6c-82e4-d2d4d814e2bb/export/reference.aaf','85d320cac14dfa2f305573d4cd870079f5ae1caac8a092b00cd8d15cc13ae2c7')
if '--slideshow-reference' in sys.argv:
 fixtures[1]=(base/'.avid-mcp-analysis/slideshow-reference-d4f8398a-2f3c-45a6-a03f-2f58516b62c0/native-export-4e730c62-606f-467a-bebe-c92ba87958a0/export/reference.aaf','1b19ec4a156788f0a47070ab7225fa128ad2f7a7ef42aedff491ab564fa1cace')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
root=base/'.avid-mcp-analysis'/('aaf-reference-copy-'+str(uuid.uuid4()));root.mkdir()
report={'root':str(root),'sources':[],'hostImportVerified':False}
try:
 ids=set();expected=[];mappings={}
 for file,digest in fixtures:
  assert sha(file)==digest
  info=inspect(file);expected.extend(info['masters'])
  with aaf2.open(str(file)) as source:
   mob_ids=[str(m.mob_id) for m in source.content.mobs]
   collisions=ids.intersection(mob_ids)
   if collisions:
    report['collisions']=sorted(collisions)
    report['conflictingMobs']=[]
    for candidate,_ in fixtures:
     with aaf2.open(str(candidate)) as comparison:
      for mob in comparison.content.mobs:
       if str(mob.mob_id) in collisions:
        report['conflictingMobs'].append({'file':str(candidate),'mobId':str(mob.mob_id),'class':type(mob).__name__,'name':mob.name,'slots':[{'id':slot.slot_id,'rate':str(getattr(slot,'edit_rate',None)),'length':slot.segment.length,'kind':slot.segment.media_kind} for slot in mob.slots]})
    if not remap:raise ValueError('Duplicate source identities require explicit conflict handling')
    mappings[str(file)]={key:MobID.new() for key in collisions}
   ids.update(mob_ids)
  report['sources'].append({'file':str(file),'sha256':digest,'info':info})
 output=root/'references.aaf'
 report['remappings']={file:{key:str(value) for key,value in mapping.items()} for file,mapping in mappings.items()}
 expected_references=[]
 with fixtures[0][0].open('rb') as original,output.open('xb') as destination:shutil.copyfileobj(original,destination)
 with aaf2.open(str(output),'rw') as target:
  for file,_ in fixtures:
   with aaf2.open(str(file)) as source:
    mapping=mappings.get(str(file),{})
    for mob in source.content.mobs:
     for original_obj,_ in mob.walk_references():
      if isinstance(original_obj,aaf2.components.SourceClip):expected_references.append((str(mapping.get(str(original_obj.mob_id),original_obj.mob_id)),original_obj.slot_id,original_obj.start,original_obj.length))
     if file==fixtures[0][0]:continue
     copied=mob.copy(root=target)
     for obj,streams in copied.walk_references():
      if streams:raise ValueError('Stream-backed graph remapping is unsupported')
      for prop in obj.properties():
       value=prop.value
       if isinstance(value,MobID) and str(value) in mapping:prop.value=mapping[str(value)]
     target.content.mobs.append(copied)
 with aaf2.open(str(output)) as reopened:
  actual_references=[(str(obj.mob_id),obj.slot_id,obj.start,obj.length) for mob in reopened.content.mobs for obj,_ in mob.walk_references() if isinstance(obj,aaf2.components.SourceClip)]
  assert sorted(actual_references)==sorted(expected_references)
  report['reopenedSourceReferences']=len(actual_references)
 combined=inspect(output)
 assert sorted(combined['masters'],key=lambda m:m['mobId'])==sorted(expected,key=lambda m:m['mobId'])
 assert sorted(combined['locators'])==sorted(set(url for item in report['sources'] for url in item['info']['locators']))
 request={'source':str(output),'output':str(root/'selects.aaf'),'expectedSha256':sha(output),'rate':'30','name':'Reference_Copy_Research','tracks':[{'name':'V1','kind':'picture'},{'name':'A1','kind':'sound','channels':2}],
          'selects':[{'mobId':m['mobId'],'start':2850,'length':60,'slotIds':[1,[2,3]]} for m in expected]}
 report['build']=build(request);report['inspection']=inspect_selects(request['output'])
 assert all(sha(file)==digest for file,digest in fixtures)
 report.update(verified=True,sourceHashesUnchanged=True,limitations=['Distinct preview/slideshow sources' if '--slideshow-reference' in sys.argv else 'Two distinct masters refer to the same prepared media','No native import qualification for this generated artifact','Experimental MobID remapping; complete descriptor/weak-reference equivalence remains unverified'])
except Exception as error:
 report.update(verified=False,error=str(error),sourceHashesUnchanged=all(sha(file)==digest for file,digest in fixtures));raise
finally:
 (root/'evidence.json').write_text(json.dumps(report,indent=2),encoding='utf8')
 print(root/'evidence.json')
