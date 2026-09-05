"""Check copied strong graphs against originals with only recorded MobID changes."""
import copy,hashlib,json,uuid
from pathlib import Path
import aaf2
from aaf_graph_diagnostic import graph,differences
base=Path(__file__).resolve().parents[2]
root=base/'.avid-mcp-analysis'/('aaf-remapped-graphs-'+str(uuid.uuid4()));root.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def substitute(value,mapping):
 if isinstance(value,dict):
  if value.get('type')=='MobID' and value.get('value') in mapping:return {**value,'value':mapping[value['value']]}
  return {key:substitute(child,mapping) for key,child in value.items()}
 if isinstance(value,list):return [substitute(child,mapping) for child in value]
 return value
results=[]
for name in ['aaf-reference-copy-93585096-4725-4e1c-9268-4b7b45e287e6','aaf-reference-copy-ba781b6d-adfa-4568-abe5-12d67f64a63b']:
 prior=json.loads((base/'.avid-mcp-analysis'/name/'evidence.json').read_text())
 output=base/'.avid-mcp-analysis'/name/'references.aaf';before=sha(output)
 expected={}
 for source in prior['sources']:
  file=Path(source['file']);assert sha(file)==source['sha256']
  mapping=prior['remappings'].get(str(file),{})
  with aaf2.open(str(file)) as f:
   for mob in f.content.mobs:
    key=mapping.get(str(mob.mob_id),str(mob.mob_id));assert key not in expected
    expected[key]=substitute(graph(mob),mapping)
 with aaf2.open(str(output)) as f:actual={str(m.mob_id):graph(m) for m in f.content.mobs}
 changes=list(differences(expected,actual))
 changed=copy.deepcopy(actual);first=next(iter(changed));changed[first]['properties']['Name']='Changed diagnostic name'
 assert list(differences(expected,changed)),'Changed metadata must be detected'
 missing=copy.deepcopy(actual);del missing[first]
 assert list(differences(expected,missing)),'Missing source mob must be detected'
 assert sha(output)==before
 assert all(sha(Path(s['file']))==s['sha256'] for s in prior['sources'])
 results.append({'file':str(output),'sha256':before,'mobs':len(actual),'differences':changes,'sourceAndOutputHashesUnchanged':True})
report={'results':results,'limitations':['Strong properties and weak-reference identities only; weak target definitions not compared','No native import or render qualification']}
(root/'evidence.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({'evidence':str(root/'evidence.json'),'differences':[len(r['differences']) for r in results]}))
assert all(not r['differences'] for r in results),'Copied graphs differ beyond the recorded MobID substitutions'
