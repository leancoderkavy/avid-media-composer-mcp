"""Bounded native selection experiment in the disposable Sonoma bin."""
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
ALLOWED={'GetOpenProjectInfo','GetListOfBinItems','SelectMobsInBin'}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument("--restore",action="store_true")
    mode.add_argument("--clear",action="store_true")
    mode.add_argument("--restore-empty",action="store_true")
    args=parser.parse_args()
    raw=BINARY.read_bytes()
    if hashlib.sha256(raw).hexdigest()!='3ca4d082a3afe00a120d6061d6ee94e20e6113238f0b016398700f3439ec9194':
        raise ValueError('Unqualified installed binary')
    verify_listener_owner(BINARY)
    pool=descriptor_pool.DescriptorPool();pool.AddSerializedFile(descriptor_pb2.DESCRIPTOR.serialized_pb)
    for name in ['MCAPI_Types.proto','MCAPI.proto']:
        pool.Add(extract_descriptor(raw,name)[0])
    directory=Path('.avid-mcp-analysis')/('native-selection-write-'+str(uuid.uuid4()));directory.mkdir()
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
    bin='MCP_AAF_Selects_20260905.avb'
    members=call('GetListOfBinItems',{'bin_relative_path':bin,'bin_flags':['AllTypes']})
    ids=sorted(v['mob_id'] for v in members)
    master='060a2b340101010501010f1013-000000-36b2e93612888806-a3b2d8bbc16d-18d9'
    if ids!=sorted([MOB,master]):raise ValueError('Unexpected fixture membership')
    selected=call('GetListOfBinItems',{'bin_relative_path':bin,'bin_flags':['AllTypes'],'only_selected_flag':True})
    expected=[] if args.restore_empty else sorted([MOB,master]) if args.restore else [MOB]
    if sorted(v['mob_id'] for v in selected)!=expected:raise ValueError('Selection changed; inspect before proceeding')
    request={'bin_path':str(PROJECT/bin),'mob_ids':[] if args.clear else [MOB] if args.restore or args.restore_empty else ids,'add_to_selection':False}
    (directory/'attempt.json').write_text(json.dumps({'request':request,'before':selected}))
    result=call('SelectMobsInBin',request)
    after=call('GetListOfBinItems',{'bin_relative_path':bin,'bin_flags':['AllTypes'],'only_selected_flag':True})
    if sorted(v['mob_id'] for v in after)!=sorted(request['mob_ids']):raise ValueError('Selection mismatch; do not replay')
    print(json.dumps({'directory':str(directory.resolve()),'result':result,'selected':after}))

if __name__=='__main__':main()
