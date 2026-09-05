"""Check copied strong graphs against originals with only recorded MobID changes."""
import copy,hashlib,json,uuid,sys
from pathlib import Path
import aaf2
from aaf_graph_diagnostic import graph,differences,referenced_definitions
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
assert sys.argv[1:] in ([],['--original-copy'])
fixtures=['aaf-reference-copy-93585096-4725-4e1c-9268-4b7b45e287e6','aaf-reference-copy-ba781b6d-adfa-4568-abe5-12d67f64a63b'] if '--original-copy' in sys.argv else ['aaf-reference-copy-9cf54d05-d15f-4b5a-b936-ca42650a9a45','aaf-reference-copy-f41a11c6-55f2-494b-b711-3e4912b30ec0']
for name in fixtures:
 prior=json.loads((base/'.avid-mcp-analysis'/name/'evidence.json').read_text())
 output=base/'.avid-mcp-analysis'/name/'references.aaf';before=sha(output)
 expected={};expected_definitions={}
 for source in prior['sources']:
  file=Path(source['file']);assert sha(file)==source['sha256']
  mapping=prior['remappings'].get(str(file),{})
  with aaf2.open(str(file)) as f:
   targets={}
   for mob in f.content.mobs:
    key=mapping.get(str(mob.mob_id),str(mob.mob_id));assert key not in expected
    expected[key]=substitute(graph(mob,weak_targets=targets),mapping)
   for key,definition in referenced_definitions(targets).items():
    if key in expected_definitions:assert expected_definitions[key]==definition,'Conflicting original weak definitions'
    expected_definitions[key]=definition
 with aaf2.open(str(output)) as f:
  targets={};actual={str(m.mob_id):graph(m,weak_targets=targets) for m in f.content.mobs}
  actual_definitions=referenced_definitions(targets)
 changes=list(differences(expected,actual))
 definition_changes=list(differences(expected_definitions,actual_definitions))
 changed=copy.deepcopy(actual);first=next(iter(changed));changed[first]['properties']['Name']='Changed diagnostic name'
 assert list(differences(expected,changed)),'Changed metadata must be detected'
 missing=copy.deepcopy(actual);del missing[first]
 assert list(differences(expected,missing)),'Missing source mob must be detected'
 assert sha(output)==before
 assert all(sha(Path(s['file']))==s['sha256'] for s in prior['sources'])
 results.append({'file':str(output),'sha256':before,'mobs':len(actual),'definitions':len(actual_definitions),'definitionDifferences':definition_changes,'differences':changes,'sourceAndOutputHashesUnchanged':True})
report={'results':results,'limitations':['Reachable stored properties and weak targets; not all implicit class/type schema definitions','No native import or render qualification']}
(root/'evidence.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({'evidence':str(root/'evidence.json'),'differences':[len(r['differences']) for r in results]}))
assert all(not r['differences'] for r in results),'Copied graphs differ beyond the recorded MobID substitutions'
assert all(not r['definitionDifferences'] for r in results),'Weak target definitions differ'
