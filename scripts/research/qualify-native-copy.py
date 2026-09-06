"""Copy a fixture sequence into a new disposable bin; never overwrite or move source items."""
import argparse
import hashlib
import json
import uuid
from pathlib import Path
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory, json_format
from inspect_mcapi import extract_descriptor, verify_listener_owner, _loopback_rpc

BINARY=Path(r'C:\Program Files\Avid\Avid Media Composer\AvidMediaComposer.exe')
PROJECT=Path(r'D:\Avid Projects\MCP_Sonoma_30p_20260905')
MOB='060a2b340101010501010f1013-000000-3737af0e12888806-0e10d8bbc16d-18d9'
ALLOWED={'GetOpenProjectInfo','GetListOfBinItems','CreateBin','CopyBinItems'}

def main():
    raw=BINARY.read_bytes()
    if hashlib.sha256(raw).hexdigest()!='3ca4d082a3afe00a120d6061d6ee94e20e6113238f0b016398700f3439ec9194':
        raise ValueError('Unqualified installed binary')
    verify_listener_owner(BINARY)
    pool=descriptor_pool.DescriptorPool();pool.AddSerializedFile(descriptor_pb2.DESCRIPTOR.serialized_pb)
    for name in ['MCAPI_Types.proto','MCAPI.proto']:
        pool.Add(extract_descriptor(raw,name)[0])
    directory=Path('.avid-mcp-analysis')/('native-copy-'+str(uuid.uuid4()));directory.mkdir()
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
            evidence.append({'method':method,'failure':str(error),'retry':'Do not retry selection; inspect host first'})
            (directory/'evidence.json').write_text(json.dumps(evidence,indent=2));raise
        evidence.append({'method':method,'responses':values});(directory/'evidence.json').write_text(json.dumps(evidence,indent=2))
        if not values or values[-1].get('header',{}).get('status')!='Completed' or any(v.get('header',{}).get('error') for v in values):
            raise ValueError('Host operation did not complete')
        return [v['body'] for v in values if 'body' in v]
    project=call('GetOpenProjectInfo')
    if len(project)!=1 or Path(project[0]['path']).resolve()!=PROJECT.resolve():raise ValueError('Wrong project')
    source=PROJECT/'MCP_AAF_Selects_20260905.avb'
    source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
    before=call('GetListOfBinItems',{'bin_relative_path':source.name,'bin_flags':['AllTypes']})
    if not any(v.get('mob_id')==MOB for v in before):raise ValueError('Fixture sequence missing')
    name='MCP_Copy_'+uuid.uuid4().hex[:12]
    destination=PROJECT/(name+'.avb')
    if destination.exists():raise ValueError('Destination exists')
    (directory/'attempt.json').write_text(json.dumps({'source':str(source),'sourceSha256':source_hash,'destination':str(destination),'mobId':MOB}))
    call('CreateBin',{'folder_path':'','bin_name':name,'option':'LastActiveBinContainer'})
    empty=call('GetListOfBinItems',{'bin_relative_path':destination.name,'bin_flags':['AllTypes']})
    if empty:raise ValueError('Destination not empty')
    current=call('GetOpenProjectInfo')
    if current[0]['path']!=project[0]['path']:raise ValueError('Project changed')
    result=call('CopyBinItems',{'source_bin_path':str(source),'destination_bin_path':str(destination),'mob_id':[MOB]})
    copied=call('GetListOfBinItems',{'bin_relative_path':destination.name,'bin_flags':['AllTypes']})
    after=call('GetListOfBinItems',{'bin_relative_path':source.name,'bin_flags':['AllTypes']})
    evidence_result={'directory':str(directory.resolve()),'destination':str(destination),'response':result,'copied':copied,'sourceMembershipUnchanged':sorted(v['mob_id'] for v in before)==sorted(v['mob_id'] for v in after),'sourceSavedBytesUnchanged':hashlib.sha256(source.read_bytes()).hexdigest()==source_hash}
    (directory/'result.json').write_text(json.dumps(evidence_result,indent=2))
    returned=[mob for body in result for mob in body.get('mob_id',[])]
    if len(returned)!=1 or len(copied)!=1 or copied[0].get('mob_id')!=returned[0] or returned[0]==MOB:raise ValueError('Expected one new response-matched copy identity; inspect evidence')
    if not evidence_result['sourceMembershipUnchanged'] or not evidence_result['sourceSavedBytesUnchanged']:raise ValueError('Source changed; inspect evidence')
    print(json.dumps(evidence_result))

if __name__=='__main__':main()
