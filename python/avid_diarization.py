"""Pinned local anonymous speaker segmentation. Downloads require --prepare.

No identity inference; returned labels have meaning only within this invocation.
"""
import argparse
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import tarfile
import urllib.request

VERSIONS = {"sherpa-onnx": "1.13.7", "sherpa-onnx-core": "1.13.7", "numpy": "2.2.6"}
ASSETS = [
    ("segmentation.tar.bz2", "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2", 6958444, "24615ee884c897d9d2ba09bb4d30da6bb1b15e685065962db5b02e76e4996488"),
    ("embedding.onnx", "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx", 39593761, "1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b"),
]
MEMBERS = [
    ("model.onnx", 5992913, "220ad67ca923bef2fa91f2390c786097bf305bceb5e261d4af67b38e938e1079"),
    ("LICENSE", 1061, "14d7016ad68e7394d6e6b78d96cc2ae431c905287b89674cfdf021e79e62b8ba"),
]


def checked_bytes(file, limit):
    if file.is_symlink() or not file.is_file():
        raise ValueError("Input must be a regular file")
    with file.open("rb") as stream:
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise ValueError("Input exceeds byte limit")
    return data


def verify(data, size, digest):
    if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
        raise ValueError("Diarization model checksum/size mismatch")


def models(root, download=False):
    for name, url, size, digest in ASSETS:
        target = root / name
        if not target.exists() and download:
            with urllib.request.urlopen(url, timeout=120) as response:
                data = response.read(size + 1)
            verify(data, size, digest)
            with target.open("xb") as stream:
                stream.write(data)
        verify(checked_bytes(target, size), size, digest)
    if download:
        with tarfile.open(root / "segmentation.tar.bz2") as archive:
            for name, size, digest in MEMBERS:
                target = root / name
                if target.exists():
                    continue
                member = archive.getmember("sherpa-onnx-pyannote-segmentation-3-0/" + name)
                if not member.isfile() or member.size != size:
                    raise ValueError("Unexpected model archive member")
                with archive.extractfile(member) as stream:
                    data = stream.read(size + 1)
                verify(data, size, digest)
                with target.open("xb") as stream:
                    stream.write(data)
    for name, size, digest in MEMBERS:
        verify(checked_bytes(root / name, size), size, digest)


def runtime():
    for name, version in VERSIONS.items():
        if importlib.metadata.version(name) != version:
            raise ValueError("Unsupported diarization runtime version")
    import sherpa_onnx
    import numpy
    return sherpa_onnx, numpy


def analyze(root, audio=None, speakers=-1, threshold=0.5):
    if type(speakers) is not int or speakers not in [-1, *range(1, 21)]:
        raise ValueError("Speaker count must be automatic or 1 through 20")
    if not math.isfinite(threshold) or not 0 < threshold <= 1:
        raise ValueError("Clustering threshold must be in (0,1]")
    models(root)
    sherpa, np = runtime()
    data = checked_bytes(audio, 600 * 16000 * 4) if audio else bytes(16000 * 4)
    if not data or len(data) % 4:
        raise ValueError("Expected nonempty mono 16 kHz float32 PCM")
    samples = np.frombuffer(data, dtype="<f4").copy()
    if not np.isfinite(samples).all():
        raise ValueError("Nonfinite audio sample")
    config = sherpa.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa.OfflineSpeakerSegmentationPyannoteModelConfig(
                model=str(root / "model.onnx"), window_shift_ratio=0.1),
            num_threads=2, provider="cpu"),
        embedding=sherpa.SpeakerEmbeddingExtractorConfig(
            model=str(root / "embedding.onnx"), num_threads=2, provider="cpu"),
        clustering=sherpa.FastClusteringConfig(num_clusters=speakers, threshold=threshold),
        min_duration_on=0.3, min_duration_off=0.5)
    model = sherpa.OfflineSpeakerDiarization(config)
    if model.sample_rate != 16000:
        raise ValueError("Unexpected diarization sample rate")
    duration = len(samples) / 16000
    spans, labels = [], {}
    for segment in model.process(samples).sort_by_start_time():
        if len(spans) >= 5000:
            raise ValueError("Speaker span limit exceeded")
        start, end = float(segment.start), float(segment.end)
        if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
            raise ValueError("Invalid speaker span")
        # Segmentation uses discrete model windows; bound the final span to PCM.
        end = min(end, duration)
        if start >= end:
            continue
        key = int(segment.speaker)
        if key < 0:
            raise ValueError("Invalid speaker label")
        if key not in labels:
            labels[key] = f"speaker-{len(labels) + 1}"
        spans.append({"start": start, "end": end, "speaker": labels[key]})
    return {"schema": 1, "recipe": 1, "versions": VERSIONS,
            "audioSha256": hashlib.sha256(data).hexdigest(), "duration": duration,
            "options": {"speakers": speakers, "threshold": threshold},
            "spans": spans, "speakerCount": len(labels),
            "reviewRequired": True, "identitiesInferred": False,
            "accuracyVerified": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--prepare", action="store_true")
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--audio", type=Path)
    parser.add_argument("--speakers", type=int, default=-1)
    parser.add_argument("--threshold", type=float, default=0.5)
    args = parser.parse_args()
    if args.root.is_symlink() or not args.root.is_dir():
        raise ValueError("Model root must be an existing direct directory")
    root = args.root.resolve()
    if args.prepare:
        models(root, download=True)
        print(json.dumps({"prepared": True}))
    else:
        print(json.dumps(analyze(root, args.audio, args.speakers, args.threshold), allow_nan=False))


if __name__ == "__main__":
    main()
