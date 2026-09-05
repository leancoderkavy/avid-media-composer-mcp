"""Research cross-file reference copying; refuses duplicate identities."""
import hashlib,json,sys,uuid
from pathlib import Path
import aaf2
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'python'))
from avid_aaf_builder import inspect,build,inspect_selects
base=Path(__file__).resolve().parents[2]
fixtures=[
 (base/'.avid-mcp-analysis/native-pcm-aaf-7e173226-261d-4e72-95fb-c2e705dd1a0c/export/PCM_reference.aaf','5c04dea1552933d8b171af3898e83fcc165709e4f283c1ba9af6b3dc4b66802d'),
 (base/'.avid-mcp-analysis/native-aaf-master-mcp-f6012198-7bad-489d-9d85-f4968f0fdcf9/native-export-b38de484-81d0-4bdf-82a5-902d55b122d0/export/reference.aaf','94ff38c9ac7256254030b3f6b24aa98d28427f5c614791a2e5e3d745423ab66c')]
assert sys.argv[1:] in ([],['--prepared-reference'])
if '--prepared-reference' in sys.argv:
 fixtures[1]=(base/'.avid-mcp-analysis/aaf-workflow-mcp-b53e7873-8af9-4f43-9b86-c7e2039c0d6f/native-export-e5f52871-15a1-4d6c-82e4-d2d4d814e2bb/export/reference.aaf','85d320cac14dfa2f305573d4cd870079f5ae1caac8a092b00cd8d15cc13ae2c7')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
root=base/'.avid-mcp-analysis'/('aaf-reference-copy-'+str(uuid.uuid4()));root.mkdir()
report={'root':str(root),'sources':[],'hostImportVerified':False}
try:
 ids=set();expected=[]
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
    assert False,'Duplicate source identities require explicit conflict handling'
   ids.update(mob_ids)
  report['sources'].append({'file':str(file),'sha256':digest,'info':info})
 output=root/'references.aaf'
 with aaf2.open(str(output),'w') as target:
  for file,_ in fixtures:
   with aaf2.open(str(file)) as source:
    for mob in source.content.mobs:target.content.mobs.append(mob.copy(root=target))
 combined=inspect(output)
 assert sorted(combined['masters'],key=lambda m:m['mobId'])==sorted(expected,key=lambda m:m['mobId'])
 assert sorted(combined['locators'])==sorted(url for item in report['sources'] for url in item['info']['locators'])
 request={'source':str(output),'output':str(root/'selects.aaf'),'expectedSha256':sha(output),'rate':'30','name':'Reference_Copy_Research','tracks':[{'name':'V1','kind':'picture'},{'name':'A1','kind':'sound','channels':2}],
          'selects':[{'mobId':m['mobId'],'start':2850,'length':60,'slotIds':[1,[2,3]]} for m in expected]}
 report['build']=build(request);report['inspection']=inspect_selects(request['output'])
 assert all(sha(file)==digest for file,digest in fixtures)
 report.update(verified=True,sourceHashesUnchanged=True,limitations=['Two distinct masters refer to the same prepared media','Not independent-media or native import qualification','Duplicate identities are refused, not reconciled'])
except Exception as error:
 report.update(verified=False,error=str(error),sourceHashesUnchanged=all(sha(file)==digest for file,digest in fixtures));raise
finally:
 (root/'evidence.json').write_text(json.dumps(report,indent=2),encoding='utf8')
 print(root/'evidence.json')
