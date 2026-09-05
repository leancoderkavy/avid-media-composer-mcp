"""One bounded sequence MP4 export from the owned Sonoma fixture; no generic RPC interface."""
import hashlib
import json
import uuid
import time
import subprocess
from pathlib import Path
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory, json_format
from inspect_mcapi import extract_descriptor, verify_listener_owner, _loopback_rpc

BINARY=Path(r'C:\Program Files\Avid\Avid Media Composer\AvidMediaComposer.exe')
PROJECT=Path(r'D:\Avid Projects\MCP_Sonoma_30p_20260905')
MOB='060a2b340101010501010f1013-000000-3737af0e12888806-0e10d8bbc16d-18d9'
ALLOWED={'GetOpenProjectInfo','GetMobInfo','GetListOfExportSettings','ExportFile'}

def wait_for_render(output, timeout=60):
    """Observe this attempt's output only. Never resubmit an export on timeout."""
    deadline=time.monotonic()+timeout
    previous=None
    while time.monotonic()<deadline:
        if output.is_file():
            details=output.stat()
            current=(details.st_size,details.st_mtime_ns)
            if details.st_size>0 and current==previous:
                probe=subprocess.run(['ffprobe','-v','error','-show_streams','-of','json',str(output)],capture_output=True,text=True,timeout=10,check=False)
                if probe.returncode==0:
                    streams=json.loads(probe.stdout).get('streams',[])
                    video=next((stream for stream in streams if stream.get('codec_type')=='video'),{})
                    if video.get('nb_frames')=='120' and video.get('avg_frame_rate')=='30/1' and float(video.get('duration',0))==4:
                        return {'bytes':details.st_size,'video':video,'readiness':'stable size/mtime across observations and complete expected video metadata'}
            previous=current
        time.sleep(1)
    raise TimeoutError('Render readiness unproven after timeout; inspect this output and host, do not replay export')

def main():
    raw=BINARY.read_bytes()
    if hashlib.sha256(raw).hexdigest()!='3ca4d082a3afe00a120d6061d6ee94e20e6113238f0b016398700f3439ec9194':
        raise ValueError('Unqualified installed binary')
    verify_listener_owner(BINARY)
    pool=descriptor_pool.DescriptorPool();pool.AddSerializedFile(descriptor_pb2.DESCRIPTOR.serialized_pb)
    for name in ['MCAPI_Types.proto','MCAPI.proto']:
        pool.Add(extract_descriptor(raw,name)[0])
    directory=Path('.avid-mcp-analysis')/('native-render-'+str(uuid.uuid4()));directory.mkdir()
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
    if 'MCP_Sonoma_AAF_Selects' not in json.dumps(info):raise ValueError('Wrong source mob')
    settings=call('GetListOfExportSettings')
    if not any('MCP_H264_Qualification' in value.get('setting_names',[]) for value in settings):raise ValueError('MCP_H264_Qualification preset missing')
    (directory/'attempt.json').write_text(json.dumps({'mob':MOB,'preset':'MCP_H264_Qualification'}))
    call('ExportFile',{'mob_id':MOB,'file_name':'MCP_Sonoma_Native_Render','export_settings_name':'MCP_H264_Qualification','destination_path':str(directory.resolve()),'in_directory':'export','option_flags':['Export_StopIf_OfflineMedia','Export_StopIf_UnknownFX']})
    output=directory/'export'/'MCP_Sonoma_Native_Render.mp4'
    readiness=wait_for_render(output)
    result={'directory':str(directory.resolve()),'output':str(output.resolve()),'readiness':readiness,'outputExists':output.is_file()}
    (directory/'output-evidence.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result))
    if not output.is_file():raise ValueError('Completed response without the requested MP4; export remains unqualified')

if __name__=='__main__':main()
