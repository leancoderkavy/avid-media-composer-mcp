"""Prepare checksum-pinned research weights. Downloads require --download."""
import argparse, hashlib, json, pathlib, tarfile, urllib.request
parser=argparse.ArgumentParser()
parser.add_argument("--download",action="store_true")
args=parser.parse_args()
root=pathlib.Path(".avid-mcp-analysis/diarization-research").resolve()
root.mkdir(parents=True,exist_ok=True)
assets=[
 ("segmentation.tar.bz2","https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2",6958444,"24615ee884c897d9d2ba09bb4d30da6bb1b15e685065962db5b02e76e4996488"),
 ("embedding.onnx","https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx",39593761,"1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b")
]
def verify(data,size,digest):
    if len(data)!=size or hashlib.sha256(data).hexdigest()!=digest: raise ValueError("Research model checksum/size mismatch")
def existing(file,size):
    with file.open("rb") as stream:return stream.read(size+1)
for name,url,size,digest in assets:
    target=root/name
    if target.exists(): verify(existing(target,size),size,digest);continue
    if not args.download: raise ValueError("Missing research model; use --download explicitly")
    with urllib.request.urlopen(url,timeout=120) as response: data=response.read(size+1)
    verify(data,size,digest)
    with target.open("xb") as stream:stream.write(data)
members=[
 ("model.onnx",5992913,"220ad67ca923bef2fa91f2390c786097bf305bceb5e261d4af67b38e938e1079"),
 ("model.int8.onnx",1540506,"d582f4b4c6b48205de7e0643c57df0df5615a3c176189be3fc461e9d18827b5d"),
 ("LICENSE",1061,"14d7016ad68e7394d6e6b78d96cc2ae431c905287b89674cfdf021e79e62b8ba")
]
with tarfile.open(root/"segmentation.tar.bz2") as archive:
    for name,size,digest in members:
        target=root/name
        if target.exists():verify(existing(target,size),size,digest);continue
        member=archive.getmember("sherpa-onnx-pyannote-segmentation-3-0/"+name)
        assert member.isfile() and member.size==size
        data=archive.extractfile(member).read(size+1)
        verify(data,size,digest)
        with target.open("xb") as stream:stream.write(data)
print(json.dumps({"root":str(root),"verified":True,"scope":"Pinned research weights only; runtime installation and final redistribution notices are separate"}))
