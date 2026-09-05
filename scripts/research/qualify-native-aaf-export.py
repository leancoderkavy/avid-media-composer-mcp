"""One bounded AAF export from the owned Sonoma fixture; no generic RPC interface."""
import hashlib
import json
import uuid
from pathlib import Path
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory, json_format
from inspect_mcapi import extract_descriptor, verify_listener_owner, _loopback_rpc

BINARY=Path(r'C:\Program Files\Avid\Avid Media Composer\AvidMediaComposer.exe')
PROJECT=Path(r'D:\Avid Projects\MCP_Sonoma_30p_20260905')
MOB='060a2b340101010001010f0013-000000-121f1ee13e08bf05-2e374c6fb537-b07c'
ALLOWED={'GetOpenProjectInfo','GetMobInfo','GetListOfExportSettings','ExportFile'}

def main():
    raw=BINARY.read_bytes()
    if hashlib.sha256(raw).hexdigest()!='3ca4d082a3afe00a120d6061d6ee94e20e6113238f0b016398700f3439ec9194':
        raise ValueError('Unqualified installed binary')
    verify_listener_owner(BINARY)
    pool=descriptor_pool.DescriptorPool();pool.AddSerializedFile(descriptor_pb2.DESCRIPTOR.serialized_pb)
    for name in ['MCAPI_Types.proto','MCAPI.proto']:
        pool.Add(extract_descriptor(raw,name)[0])
    directory=Path('.avid-mcp-analysis')/('native-aaf-'+str(uuid.uuid4()));directory.mkdir()
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
    info=call('GetMobInfo',{'mob_id':MOB})
    if 'Sonoma_Escape_RoughCut_v1_preview' not in json.dumps(info):raise ValueError('Wrong source mob')
    settings=call('GetListOfExportSettings')
    if not any('AAF' in value.get('setting_names',[]) for value in settings):raise ValueError('AAF preset missing')
    (directory/'attempt.json').write_text(json.dumps({'mob':MOB,'preset':'AAF'}))
    call('ExportFile',{'mob_id':MOB,'file_name':'Sonoma_reference.aaf','export_settings_name':'AAF','destination_path':str(directory.resolve()),'in_directory':'export','option_flags':['Export_StopIf_OfflineMedia','Export_StopIf_UnknownFX']})
    output=directory/'export'/'Sonoma_reference.aaf.aaf'
    result={'directory':str(directory.resolve()),'files':[p.name for p in directory.iterdir()],'outputExists':output.is_file()}
    print(json.dumps(result))
    if not output.is_file():raise ValueError('Completed response without the requested AAF; export remains unqualified')

if __name__=='__main__':main()
