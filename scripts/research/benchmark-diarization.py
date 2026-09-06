"""Local diarization candidate qualification using original synthetic speech and Sonoma."""
import argparse, hashlib, json, pathlib, subprocess, time, uuid, wave
import numpy as np
import sherpa_onnx

parser=argparse.ArgumentParser()
parser.add_argument("fixture")
parser.add_argument("--sonoma-seconds",type=float,default=60)
parser.add_argument("--sonoma-only",action="store_true")
args=parser.parse_args()
assert 0<args.sonoma_seconds<=600
base=pathlib.Path(".avid-mcp-analysis/diarization-research").resolve()
root=pathlib.Path(".avid-mcp-analysis")/("diarization-"+str(uuid.uuid4()))
root.mkdir()
expected={"model.onnx":"220ad67ca923bef2fa91f2390c786097bf305bceb5e261d4af67b38e938e1079","embedding.onnx":"1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b"}
def sha(file):
    with open(file,"rb") as stream:
        return hashlib.file_digest(stream,"sha256").hexdigest()
for name,digest in expected.items(): assert sha(base/name)==digest
fixture=json.loads(pathlib.Path(args.fixture).read_text(encoding="utf-8-sig"))
def pcm(file):
    with wave.open(str(file),"rb") as source:
        assert source.getframerate()==16000 and source.getnchannels()==1 and source.getsampwidth()==2
        return np.frombuffer(source.readframes(source.getnframes()),dtype="<i2").astype(np.float32)/32768
chunks=[np.zeros(9600,dtype=np.float32)]
turns=[]
for turn in fixture["turns"]:
    audio=pcm(turn["file"])
    start=sum(len(chunk) for chunk in chunks)/16000
    turns.append({**turn,"sha256":sha(turn["file"]),"start":start,"end":start+len(audio)/16000})
    chunks.extend([audio,np.zeros(12800,dtype=np.float32)])
combined=np.concatenate(chunks)
def wav(file,audio):
    with wave.open(str(file),"wb") as target:
        target.setnchannels(1);target.setsampwidth(2);target.setframerate(16000)
        target.writeframes(np.round(np.clip(audio,-1,1)*32767).astype("<i2").tobytes())
wav(root/"alternating.wav",combined)
# Overlap deliberately combines complete first/second turns with a two-second offset.
first,second=pcm(turns[0]["file"]),pcm(turns[1]["file"])
overlap=np.zeros(max(len(first),32000+len(second)),dtype=np.float32)
overlap[:len(first)]+=first*.5
overlap[32000:32000+len(second)]+=second*.5
wav(root/"overlap.wav",overlap)
source=pathlib.Path("D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4")
source_hash=sha(source)
subprocess.run(["ffmpeg","-nostdin","-v","error","-n","-protocol_whitelist","file,pipe","-i",str(source),"-t",str(args.sonoma_seconds),"-map","0:a:0","-af","aresample=async=1:first_pts=0","-ac","1","-ar","16000","-c:a","pcm_s16le",str(root/"sonoma.wav")],check=True)
def detector(count):
    config=sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(base/"model.onnx"),window_shift_ratio=0.1),num_threads=2,provider="cpu"),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=str(base/"embedding.onnx"),num_threads=2,provider="cpu"),
        clustering=sherpa_onnx.FastClusteringConfig(num_clusters=count,threshold=0.5),
        min_duration_on=0.3,min_duration_off=0.5)
    assert config.validate()
    return sherpa_onnx.OfflineSpeakerDiarization(config)
results=[]
for count in [-1,2]:
    load_start=time.perf_counter();model=detector(count);load_seconds=time.perf_counter()-load_start
    for name,audio in [("alternating",combined),("overlap",overlap),("silence",np.zeros(160000,dtype=np.float32)),("sonoma",pcm(root/"sonoma.wav"))]:
        if args.sonoma_only and name!="sonoma":continue
        if name=="sonoma":assert len(audio)/16000<=args.sonoma_seconds+0.001
        start=time.perf_counter()
        output=[dict(start=float(s.start),end=float(s.end),speaker=int(s.speaker)) for s in model.process(audio).sort_by_start_time()]
        elapsed=time.perf_counter()-start
        assert all(0<=s["start"]<s["end"]<=len(audio)/16000+0.1 and s["speaker"]>=0 for s in output)
        row=dict(fixture=name,numClusters=count,threshold=0.5,duration=len(audio)/16000,loadSeconds=load_seconds,elapsedSeconds=elapsed,segments=output)
        if name=="alternating":
            assignments=[]
            for turn in turns:
                durations={}
                for segment in output:
                    seconds=max(0,min(turn["end"],segment["end"])-max(turn["start"],segment["start"]))
                    durations[segment["speaker"]]=durations.get(segment["speaker"],0)+seconds
                label=max(durations,key=durations.get) if durations and max(durations.values())>0 else None
                assignments.append(dict(voice=turn["voice"],label=label,durations=durations))
            labels=[a["label"] for a in assignments]
            row.update(assignments=assignments,alternatingLabelsMatch=all(label is not None for label in labels) and labels[0]==labels[2] and labels[1]==labels[3] and labels[0]!=labels[1])
        results.append(row)
        print(json.dumps(dict(fixture=name,count=count,segments=len(output),elapsedSeconds=elapsed,alternatingLabelsMatch=row.get("alternatingLabelsMatch"))),flush=True)
assert sha(source)==source_hash
for turn in turns: assert sha(turn["file"])==turn["sha256"]
for name,digest in expected.items(): assert sha(base/name)==digest
evidence=dict(audioExtraction={"filter":"aresample=async=1:first_pts=0","requestedSeconds":args.sonoma_seconds},runtime={"sherpa_onnx":sherpa_onnx.__version__,"numpy":np.__version__},models=expected,fixture=fixture,turns=turns,source=str(source),sourceHash=source_hash,results=results,sourceAndModelsUnchanged=True,scope="Candidate execution and whole-turn synthetic label matching; no real-world diarization error rate, speaker identity, transcript alignment or MCP integration claim.")
(root/"evidence.json").write_text(json.dumps(evidence,indent=2),encoding="utf-8")
print(json.dumps({"evidence":str((root/"evidence.json").resolve())}))
