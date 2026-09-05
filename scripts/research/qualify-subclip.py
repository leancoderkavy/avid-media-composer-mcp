"""Single disposable-project subclip experiment; no generic RPC interface."""
import json
from pathlib import Path
import native_host_smoke as native

directory=Path('.avid-mcp-analysis/progressive-subclip')
directory.mkdir(exist_ok=True)
attempt=directory/'attempt.json'
if attempt.exists():
    raise RuntimeError('Inspect the previous attempt before another experiment')
smoke=native.Smoke(directory)
expected=Path('D:/Avid Projects/MCP_Sonoma_30p_20260905').resolve()
if smoke.current_project()!=expected:
    raise RuntimeError('Wrong project')
bin_name='MCP_Sonoma_Media.avb'
items=smoke.call('GetListOfBinItems',{'bin_relative_path':bin_name,'bin_flags':['AllTypes']})
matches=[item for item in items if item.get('mob_name','').endswith('v1_preview') or item.get('mob_name','').endswith('v1_preview.mp4')]
if len(matches)!=1:
    raise RuntimeError('Expected one preview source: '+json.dumps(items))
request={'destination_bin_path':bin_name,'mob_id':matches[0]['mob_id'],
         'track_list':{'track_labels':[{'type':'TRACKTYPE_PICTURE','number':1}]},
         'head_frame':2850,'end_frame':2910,'create_new_sequence':True}
attempt.write_text(json.dumps({'before':items,'request':request},indent=2))
native.METHODS=native.METHODS|{'CreateSubClip'}
result=smoke.call('CreateSubClip',request)
after=smoke.call('GetListOfBinItems',{'bin_relative_path':bin_name,'bin_flags':['AllTypes']})
new=[item for item in after if item['mob_id'] not in {item['mob_id'] for item in items}]
details=[smoke.call('GetMobInfo',{'mob_id':item['mob_id']}) for item in new]
(directory/'result.json').write_text(json.dumps({'result':result,'new':new,'details':details},indent=2))
print(json.dumps({'new':new,'details':details}))
