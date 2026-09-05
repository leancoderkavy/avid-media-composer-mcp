from aaf2.core import AAFObject
from aaf2 import properties
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
