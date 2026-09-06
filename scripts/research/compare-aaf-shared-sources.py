"""Bounded read-only diagnostic of all strong properties of shared source mobs."""
import hashlib,json,sys,uuid
from pathlib import Path
import aaf2
from aaf2.core import AAFObject
from aaf2 import properties
base=Path(__file__).resolve().parents[2]
evidence=base/'.avid-mcp-analysis/aaf-reference-copy-5633b2c5-17ea-46f1-90e8-69dd96d0d8ab/evidence.json'
prior=json.loads(evidence.read_text())
files=list(dict.fromkeys(item['file'] for item in prior['conflictingMobs']))
root=base/'.avid-mcp-analysis'/('aaf-shared-sources-'+str(uuid.uuid4()));root.mkdir()
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
before={file:sha(file) for file in files}
assert list(before.values())==['5c04dea1552933d8b171af3898e83fcc165709e4f283c1ba9af6b3dc4b66802d','85d320cac14dfa2f305573d4cd870079f5ae1caac8a092b00cd8d15cc13ae2c7']
from aaf_graph_diagnostic import graph,differences
graphs=[]
for file in files:
 with aaf2.open(file) as f:graphs.append({str(m.mob_id):graph(m) for m in f.content.mobs if str(m.mob_id) in prior['collisions']})
comparisons=[{'mobId':key,'differences':list(differences(graphs[0][key],graphs[1][key]))} for key in prior['collisions']]
assert not list(differences(graphs[0],graphs[0]))
assert list(differences({'a':[1]},{'a':[2]}))==[{'path':'/a/0','left':1,'right':2}]
assert all(sha(file)==digest for file,digest in before.items())
report={'sources':before,'graphs':graphs,'comparisons':comparisons,'sourcesUnchanged':True,'limitations':['Diagnostic only; weak references compared by identity, not target definition','No properties excluded; differences are not automatically safe to discard','No merge or source mutation']}
(root/'evidence.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({'evidence':str(root/'evidence.json'),'differences':[len(c['differences']) for c in comparisons]}))
