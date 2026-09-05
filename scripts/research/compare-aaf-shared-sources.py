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
visited=0
def scalar(value):
 if value is None or isinstance(value,(str,int,float,bool)):return value
 if isinstance(value,(list,tuple)):return [scalar(v) for v in value]
 if isinstance(value,dict):return {str(k):scalar(v) for k,v in value.items()}
 if isinstance(value,(bytes,bytearray)):return {'bytes':bytes(value).hex()}
 return {'type':type(value).__name__,'value':str(value)}
def graph(obj,depth=0):
 global visited
 visited+=1
 if visited>10000:raise ValueError('Graph object limit exceeded')
 if depth>40:raise ValueError('Graph depth exceeded')
 result={'class':str(obj.class_id),'properties':{}}
 for prop in obj.properties():
  if isinstance(prop,(properties.StreamProperty,properties.OpaqueStreamProperty)):raise ValueError('Stream properties need separate comparison')
  if isinstance(prop,(properties.WeakRefProperty,properties.WeakRefArrayProperty)):
   value=prop.value;values=value if isinstance(value,list) else [value]
   encoded=[{'class':str(v.class_id),'id':str(v.unique_key)} for v in values]
  else:
   value=prop.value
   if isinstance(value,AAFObject):encoded=graph(value,depth+1)
   elif isinstance(value,list):encoded=[graph(v,depth+1) if isinstance(v,AAFObject) else scalar(v) for v in value]
   else:encoded=scalar(value)
  result['properties'][prop.name]=encoded
 return result
def differences(a,b,pointer=''):
 if isinstance(a,dict) and isinstance(b,dict):
  for key in sorted(a.keys()|b.keys()):
   if key not in a or key not in b:yield {'path':pointer+'/'+key,'left':a.get(key),'right':b.get(key)}
   else:yield from differences(a[key],b[key],pointer+'/'+key)
 elif isinstance(a,list) and isinstance(b,list) and len(a)==len(b):
  for i,(left,right) in enumerate(zip(a,b)):yield from differences(left,right,pointer+'/'+str(i))
 elif a!=b:yield {'path':pointer,'left':a,'right':b}
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
