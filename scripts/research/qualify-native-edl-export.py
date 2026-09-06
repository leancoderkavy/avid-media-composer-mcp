"""One bounded EDL export experiment from the disposable Sonoma sequence; inspect dialogs after invocation."""
import hashlib
import json
import uuid
from pathlib import Path
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory, json_format
from inspect_mcapi import extract_descriptor, verify_listener_owner, _loopback_rpc

BINARY=Path(r'C:\Program Files\Avid\Avid Media Composer\AvidMediaComposer.exe')
PROJECT=Path(r'D:\Avid Projects\MCP_Sonoma_30p_20260905')
MOB='060a2b340101010501010f1013-000000-3737af0e12888806-0e10d8bbc16d-18d9'
ALLOWED={'GetOpenProjectInfo','GetMobInfo','GetListOfExportEDLSettings','GetListOfBinItems','ExportEDL'}

def main():
    expected=Path.home()/'Avid EDL Exports'/'MCP_Sonoma_AAF_Selects.edl'
    if expected.exists():raise ValueError('Research output already exists; do not replay or overwrite')
    raw=BINARY.read_bytes()
    if hashlib.sha256(raw).hexdigest()!='3ca4d082a3afe00a120d6061d6ee94e20e6113238f0b016398700f3439ec9194':
        raise ValueError('Unqualified installed binary')
    verify_listener_owner(BINARY)
    pool=descriptor_pool.DescriptorPool();pool.AddSerializedFile(descriptor_pb2.DESCRIPTOR.serialized_pb)
    for name in ['MCAPI_Types.proto','MCAPI.proto']:
        pool.Add(extract_descriptor(raw,name)[0])
    directory=Path('.avid-mcp-analysis')/('native-edl-'+str(uuid.uuid4()));directory.mkdir()
    evidence=[]
    def call(method,body=None):
        if method not in ALLOWED:raise ValueError('Unsupported research method')
        verify_listener_owner(BINARY)
        request=message_factory.GetMessageClass(pool.FindMessageTypeByName('mcapi.'+method+'Request'))()
        if body:json_format.ParseDict({'body':body},request)
        response=message_factory.GetMessageClass(pool.FindMessageTypeByName('mcapi.'+method+'Response'))
        try:
            values=[json_format.MessageToDict(response.FromString(data),preserving_proto_field_name=True) for data in _loopback_rpc(method,request.SerializeToString())]
        except Exception as error:
            evidence.append({'method':method,'failure':str(error),'retry':'Do not retry export; inspect output and host first'})
            (directory/'evidence.json').write_text(json.dumps(evidence,indent=2));raise
        evidence.append({'method':method,'responses':values});(directory/'evidence.json').write_text(json.dumps(evidence,indent=2))
        if not values or values[-1].get('header',{}).get('status')!='Completed' or any(v.get('header',{}).get('error') for v in values):
            raise ValueError('Host operation did not complete')
        return [v['body'] for v in values if 'body' in v]
    project=call('GetOpenProjectInfo')
    if len(project)!=1 or Path(project[0]['path']).resolve()!=PROJECT.resolve():raise ValueError('Wrong project')
    members=call('GetListOfBinItems',{'bin_relative_path':'MCP_AAF_Selects_20260905.avb','bin_flags':['AllTypes']})
    if not any(v.get('mob_id')==MOB for v in members):raise ValueError('Target is not in disposable bin')
    info=call('GetMobInfo',{'mob_id':MOB})
    columns={v.get('column_name'):v.get('column_value') for v in info}
    if columns.get('Name')!='MCP_Sonoma_AAF_Selects' or columns.get('Frame Count Duration')!='120':raise ValueError('Unexpected sequence')
    settings=call('GetListOfExportEDLSettings')
    if not any('Default EDL' in v.get('setting_names',[]) for v in settings):raise ValueError('Preset missing')
    request={'mob_id':MOB,'edl_settings_name':'Default EDL','track_list':{'track_labels':[{'type':'TRACKTYPE_PICTURE','number':1},{'type':'TRACKTYPE_SOUND','number':1},{'type':'TRACKTYPE_SOUND','number':2}]}}
    (directory/'attempt.json').write_text(json.dumps({'request':request,'scope':'No destination field; inspect returned path/dialogs and never automatically replay.'}))
    result=call('ExportEDL',request)
    print(json.dumps({'directory':str(directory.resolve()),'result':result}))

if __name__=='__main__':main()
