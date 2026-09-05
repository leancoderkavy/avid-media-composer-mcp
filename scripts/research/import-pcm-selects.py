"""Import only the checksum-qualified PCM selects AAF into a new owned bin."""
import hashlib,json,os,uuid
from pathlib import Path
from google.protobuf import descriptor_pb2,descriptor_pool,message_factory,json_format
from inspect_mcapi import extract_descriptor,verify_listener_owner,_loopback_rpc

BINARY=Path('C:/Program Files/Avid/Avid Media Composer/AvidMediaComposer.exe')
PROJECT=Path('D:/Avid Projects/MCP_Sonoma_30p_20260905')
AAF=Path('.avid-mcp-analysis/pcm-selects-mcp-f5a64b29-f0f8-4a5d-8884-f05ce760bb1a/avid-mcp-library/aaf-2ba5a255-2f6a-4645-85ed-58b5ba0e7040/selects.aaf').resolve()
MEDIA=Path('.avid-mcp-analysis/sonoma-source-clock-857e680b-48a7-4dc9-a52e-478f864ef2b9/Sonoma_SourceClock_Stereo.mov').resolve()
METHODS={'GetOpenProjectInfo','GetListOfImportSettings','CreateBin','GetListOfBinItems','ImportFile','GetMobInfo','CloseBin','OpenBin'}
def sha(file):
    with file.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def main():
    assert sha(AAF)=='823befe43a192982e25b6c882dd85865595fdcf1184eec03e838206d74e57aa6'
    assert sha(MEDIA)=='f46de96396ec30be8d41ff3c2f7d8aaf08ba190cdb2295e863ce535e7965bbeb'
    original=PROJECT/'MCP_AAF_Selects_20260905.avb';original_sha=sha(original)
    raw=BINARY.read_bytes();assert hashlib.sha256(raw).hexdigest()=='3ca4d082a3afe00a120d6061d6ee94e20e6113238f0b016398700f3439ec9194'
    pool=descriptor_pool.DescriptorPool();pool.AddSerializedFile(descriptor_pb2.DESCRIPTOR.serialized_pb)
    for name in ['MCAPI_Types.proto','MCAPI.proto']:pool.Add(extract_descriptor(raw,name)[0])
    root=Path('.avid-mcp-analysis')/('pcm-native-import-'+str(uuid.uuid4()));root.mkdir()
    bin_name='MCP_PCMAAF_'+uuid.uuid4().hex[:8];bin_file=bin_name+'.avb';calls=[]
    def call(method,body=None):
        assert method in METHODS;verify_listener_owner(BINARY)
        request=message_factory.GetMessageClass(pool.FindMessageTypeByName('mcapi.'+method+'Request'))()
        if body:json_format.ParseDict({'body':body},request)
        response=message_factory.GetMessageClass(pool.FindMessageTypeByName('mcapi.'+method+'Response'))
        values=[json_format.MessageToDict(response.FromString(data),preserving_proto_field_name=True) for data in _loopback_rpc(method,request.SerializeToString())]
        calls.append({'method':method,'body':body,'responses':values});(root/'calls.json').write_text(json.dumps(calls,indent=2),encoding='utf8')
        assert values and values[-1].get('header',{}).get('status')=='Completed' and not any(v.get('header',{}).get('error') for v in values),values
        return [v['body'] for v in values if 'body' in v]
    lock=Path.home()/'.avid-mcp/native-write.lock';lock.parent.mkdir(exist_ok=True)
    with lock.open('x',encoding='utf8') as handle:handle.write(json.dumps({'pid':os.getpid(),'research':'PCM AAF import','evidence':str(root.resolve())}))
    dispatched=False;complete=False
    try:
        project=call('GetOpenProjectInfo');assert len(project)==1 and Path(project[0]['path']).resolve()==PROJECT.resolve()
        settings=call('GetListOfImportSettings');assert any('Untitled' in value.get('setting_names',[]) for value in settings)
        (root/'attempt.json').write_text(json.dumps({'bin':bin_file,'aaf':str(AAF)}),encoding='utf8')
        dispatched=True
        call('CreateBin',{'folder_path':'','bin_name':bin_name,'option':'LastActiveBinContainer'})
        read_body={'bin_relative_path':bin_file,'bin_flags':['AllTypes']}
        assert not call('GetListOfBinItems',read_body)
        call('ImportFile',{'file_path':str(AAF),'import_settings_name':'Untitled','destination_bin':bin_file,'option_flags':['Import_StopIf_Media_No_in_DB']})
        items=call('GetListOfBinItems',read_body)
        matches=[item for item in items if item['mob_name']=='MCP_PCM_AAF_Selects'];assert len(matches)==1
        sequence=matches[0];info=call('GetMobInfo',{'mob_id':sequence['mob_id']})
        columns={column['column_name']:column.get('column_value') for column in info}
        assert columns.get('Frame Count Duration')=='120' and columns.get('FPS')=='30.00' and columns.get('Name')=='MCP_PCM_AAF_Selects'
        call('CloseBin',{'bin_path':str(PROJECT/bin_file)});saved_sha=sha(PROJECT/bin_file)
        call('OpenBin',{'bin_path':str(PROJECT/bin_file)})
        assert sequence in call('GetListOfBinItems',read_body)
        assert sha(AAF)=='823befe43a192982e25b6c882dd85865595fdcf1184eec03e838206d74e57aa6'
        assert sha(MEDIA)=='f46de96396ec30be8d41ff3c2f7d8aaf08ba190cdb2295e863ce535e7965bbeb' and sha(original)==original_sha
        report={'bin':bin_file,'sequence':sequence,'info':info,'savedBinSha256':saved_sha,'reopenedIdentityVerified':True,'sourceAndOriginalBinUnchanged':True,'renderVerified':False}
        (root/'evidence.json').write_text(json.dumps(report,indent=2),encoding='utf8');complete=True
        print(json.dumps({'evidence':str((root/'evidence.json').resolve()),**report}))
    finally:
        if complete or not dispatched:lock.unlink()
        else:print('Native write lock retained: inspect host and research attempt before recovery; do not replay import.')
if __name__=='__main__':main()
