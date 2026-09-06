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
ALLOWED={'GetOpenProjectInfo','GetListOfBinItems','CreateBin','CopyBinItems','DuplicateBinItems'}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument("--both",action="store_true")
    mode.add_argument("--master",action="store_true")
    parser.add_argument("--duplicate",action="store_true",help="After copying, duplicate only returned items within the newly created owned bin")
    args=parser.parse_args()
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
    requested=[MOB]
    if args.both or args.master:
        master='060a2b340101010501010f1013-000000-36b2e93612888806-a3b2d8bbc16d-18d9'
        if not any(v.get('mob_id')==master for v in before):raise ValueError('Fixture master missing')
        requested=[master] if args.master else [master,MOB]
    name='MCP_Copy_'+uuid.uuid4().hex[:12]
    destination=PROJECT/(name+'.avb')
    if destination.exists():raise ValueError('Destination exists')
    (directory/'attempt.json').write_text(json.dumps({'source':str(source),'sourceSha256':source_hash,'destination':str(destination),'mobIds':requested}))
    call('CreateBin',{'folder_path':'','bin_name':name,'option':'LastActiveBinContainer'})
    empty=call('GetListOfBinItems',{'bin_relative_path':destination.name,'bin_flags':['AllTypes']})
    if empty:raise ValueError('Destination not empty')
    current=call('GetOpenProjectInfo')
    if current[0]['path']!=project[0]['path']:raise ValueError('Project changed')
    result=call('CopyBinItems',{'source_bin_path':str(source),'destination_bin_path':str(destination),'mob_id':requested})
    copied=call('GetListOfBinItems',{'bin_relative_path':destination.name,'bin_flags':['AllTypes']})
    after=call('GetListOfBinItems',{'bin_relative_path':source.name,'bin_flags':['AllTypes']})
    evidence_result={'directory':str(directory.resolve()),'destination':str(destination),'response':result,'copied':copied,'sourceMembershipUnchanged':sorted(v['mob_id'] for v in before)==sorted(v['mob_id'] for v in after),'sourceSavedBytesUnchanged':hashlib.sha256(source.read_bytes()).hexdigest()==source_hash}
    (directory/'result.json').write_text(json.dumps(evidence_result,indent=2))
    returned=[mob for body in result for mob in body.get('mob_id',[])]
    if len(returned)!=len(requested) or len(set(returned))!=len(returned) or sorted(v.get('mob_id') for v in copied)!=sorted(returned):raise ValueError('Expected response-matched copy identities; inspect evidence')
    if not evidence_result['sourceMembershipUnchanged'] or not evidence_result['sourceSavedBytesUnchanged']:raise ValueError('Source changed; inspect evidence')
    if args.duplicate:
        current=call('GetOpenProjectInfo')
        if current[0]['path']!=project[0]['path']:raise ValueError('Project changed before duplication')
        # Only the new bin and identities returned by this run's verified copy.
        attempt={'bin':str(destination),'requested':returned,'before':copied}
        (directory/'duplicate-attempt.json').write_text(json.dumps(attempt,indent=2))
        duplicated=call('DuplicateBinItems',{'bin_path':str(destination),'mob_id':returned})
        final=call('GetListOfBinItems',{'bin_relative_path':destination.name,'bin_flags':['AllTypes']})
        source_after=call('GetListOfBinItems',{'bin_relative_path':source.name,'bin_flags':['AllTypes']})
        result_ids=[mob for body in duplicated for mob in body.get('mob_id',[])]
        duplicate_evidence={'response':duplicated,'after':final,'returned':result_ids,
                            'sourceMembershipUnchanged':sorted(v['mob_id'] for v in source_after)==sorted(v['mob_id'] for v in before),
                            'sourceSavedBytesUnchanged':hashlib.sha256(source.read_bytes()).hexdigest()==source_hash,
                            'scope':'Single actual duplication in a newly created owned bin. Native identities/membership only; saved graph, persistence, undo and original media essence qualification remain separate.'}
        (directory/'duplicate-result.json').write_text(json.dumps(duplicate_evidence,indent=2))
        if len(result_ids)!=len(returned) or len(set(result_ids))!=len(result_ids) or set(result_ids)&set(returned):raise ValueError('Unexpected duplicate response identities')
        if sorted(v.get('mob_id') for v in final)!=sorted(returned+result_ids):raise ValueError('Unexpected post-duplicate membership')
        if not duplicate_evidence['sourceMembershipUnchanged'] or not duplicate_evidence['sourceSavedBytesUnchanged']:raise ValueError('Protected source changed during duplication')
        originals={v['mob_id']:v.get('mob_name') for v in copied}
        if any(v.get('mob_name')!=originals[v['mob_id']] for v in final if v['mob_id'] in originals):raise ValueError('Original copied item renamed during duplication')
        evidence_result['duplication']=duplicate_evidence
        (directory/'result.json').write_text(json.dumps(evidence_result,indent=2))
    print(json.dumps(evidence_result))

if __name__=='__main__':main()
