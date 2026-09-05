# Local speaker diarization candidate

This research evaluates an original wrapper around sherpa-onnx, separating speaker intervals from transcription. It does not yet add a shipping MCP tool, identify people, or assign names to voices.

## Sources and licensing

The [official diarization documentation](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/models.html) describes the segmentation-plus-embedding API and publicly distributed ONNX conversions. The evaluated segmentation archive includes the MIT license for pyannote segmentation 3.0. Its [upstream license](https://huggingface.co/pyannote/segmentation-3.0/blob/main/LICENSE) is also public. The documentation marks the Reverb alternative non-commercial, so it was not selected.

The embedding is ERes2Net-Base trained on 3D-Speaker. The [publisher's model metadata API](https://modelscope.cn/api/v1/models/iic/speech_eres2net_base_sv_zh-cn_3dspeaker_16k) returned Apache License 2.0 on 2026-09-05; the response fields are retained in .avid-mcp-analysis/diarization-research/model-license.json. The [3D-Speaker repository](https://github.com/modelscope/3D-Speaker/blob/main/LICENSE) also publishes Apache 2.0. The converted weight's origin, notices and runtime dependencies still need the final distribution audit before release integration.

Runtime: sherpa-onnx 1.13.7, sherpa-onnx-core 1.13.7 and NumPy 2.2.6 in an isolated Python 3.12 environment. Binary-only installation and pip check passed. No runtime or model weights are bundled in this commit.

| Artifact | SHA-256 |
| --- | --- |
| Segmentation archive | 24615ee884c897d9d2ba09bb4d30da6bb1b15e685065962db5b02e76e4996488 |
| Float32 segmentation model | 220ad67ca923bef2fa91f2390c786097bf305bceb5e261d4af67b38e938e1079 |
| ERes2Net embedding | 1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b |

The preparation script validates exact sizes/hashes and extracts only named regular archive members. Downloads require --download. Inference uses local model paths.

## Actual test

The fixture script creates four original editorial utterances using Microsoft David Desktop and Microsoft Zira Desktop in alternating order. It retains the selected synthesizer, text and WAV file for each turn; these labels do not refer to real people. The benchmark also mixes two turns with a two-second offset, tests digital silence, and decodes the Sonoma preview.

Configuration: CPU with two threads, segmentation window shift ratio 0.1, minimum on/off durations 0.3/0.5 seconds, clustering threshold 0.5. Both automatic clustering and a supplied count of two were tested.

Final evidence: .avid-mcp-analysis/diarization-601e82eb-5f3d-407d-91b5-7507f0ac7175/evidence.json.

| Fixture | Result |
| --- | --- |
| Alternating synthetic voices, 29.155 seconds | Both modes returned eight segments, with the dominant interval labels matching A/B/A/B across all four turns. Whole-turn overlap assigned no detected time to the other voice. This is not a speech-boundary DER measurement; synthesized turns contain pauses. |
| Mixed voices, 8.265 seconds | Both modes returned four spans, including overlaps between different labels. Completeness of overlap detection is unqualified. |
| Digital silence, 10 seconds | Both modes returned zero segments. This does not establish music/noise rejection. |
| Full Sonoma preview, 190.8666875 decoded seconds | Automatic mode returned 66 intervals and 40 distinct anonymous labels in 28.985 seconds. Fixed-two mode returned 47 intervals and two labels in 26.922 seconds. No manually labelled speaker reference exists for this montage, so these counts are not verified speakers. |

Models, original synthesized WAVs and the source MP4 retained their hashes. Synthetic correctness does not establish performance on natural dialogue, accents, changing microphones, music or overlapping speech. Labels are local to a run and are not person identities.

## Audio timestamp finding

The initial plain FFmpeg PCM extraction produced 60.304 seconds for a requested 60 seconds, and 191.5146875 seconds for the full-range request. The source audio declares 190.854667 seconds. Concatenated decoded samples therefore did not preserve the source timestamp clock.

The research extractor now uses aresample=async=1:first_pts=0. A 60-second request produced exactly 60 seconds, and the full request produced 190.8666875 seconds, within one sample of the requested duration. The final evidence above uses this compensated input; older candidate results a1bb7e6c and b14f638f used uncompensated audio and must not be treated as source-timing proof.

This finding also requires a dedicated review of the shipping speech PCM extraction path before diarization-to-transcript alignment. Compensation changes the analysis signal to follow timestamps; waveform fidelity, delayed streams, discontinuities and nonzero ranges need their own fixtures. No production extraction behavior was changed by this research commit.

## Reproduce on Windows

From the repository root, create an isolated environment and install the exact dependencies:

```powershell
python -m venv .avid-mcp-analysis/diarization-research/runtime
.avid-mcp-analysis/diarization-research/runtime/Scripts/python.exe -m pip install --only-binary=:all: sherpa-onnx==1.13.7 numpy==2.2.6
.avid-mcp-analysis/diarization-research/runtime/Scripts/python.exe scripts/research/prepare-diarization-models.py --download
powershell -File scripts/research/create-diarization-fixture.ps1
```

Pass the returned fixture.json to scripts/research/benchmark-diarization.py, using the isolated Python and --sonoma-seconds 190.866666. The script expects the local Sonoma MP4 path recorded in its source and FFmpeg on PATH. --sonoma-only skips the synthetic inference cases.

Remaining implementation following the original research: managed model/runtime setup, scoped extraction with qualified source timestamps, bounded persisted speaker intervals, discovery/deletion/review, optional supplied speaker counts, anonymous label correction, transcript alignment with ambiguity handling, job cancellation/recovery and real-world accuracy/resource tests.


## Managed runtime and packaged worker qualification

The branch now packages `python/avid_diarization.py` and provides `--download-models --diarization` plus `--diarization-runtime-status`. The worker retains the pinned model/runtime contract, validates finite bounded PCM and output spans, normalizes anonymous labels by first appearance, and supports automatic or supplied speaker counts. It does not yet expose persisted MCP speaker operations. Preparation downloads only the fixed artifacts above, verifies exact sizes/hashes, and extracts only selected regular archive members; it never executes archive contents.

A fresh Windows Python 3.12 installation passed binary-only dependency installation, pip check, model verification and one-second silence inference. Its completed receipt binds the installation tree and packaged worker. The qualification script reused it with a deliberately nonexistent base Python command, verified tree consistency after inference, rejected a deliberate extra file during setup, retained that file until the script removed its own test file, and verified the restored tree. No automatic dependency or model changes occur during reuse.

Actual worker results using the production source-clock extractor:

| Input | Automatic | Supplied two |
| --- | --- | --- |
| Original alternating voices, 29.155 seconds | Eight spans, two labels, dominant A/B/A/B; 4.13 s | Eight spans, two labels, dominant A/B/A/B; 4.16 s |
| Sonoma preview, 190.8666875 seconds | 64 spans, 40 anonymous labels; 26.63 s | 43 spans, two labels; 31.64 s |

Evidence: `.avid-mcp-analysis/diarization-runtime-19994a23-ddde-41f4-af47-2138a523160b/evidence.json`; fresh-install receipt/output: `.avid-mcp-analysis/diarization-production-install.log`. Reproduce with `node scripts/research/qualify-diarization-runtime.mjs` after building and installing the runtime, using the retained original fixture and configured FFmpeg. Sources and installation tree remained unchanged. The float32 production extractor produces different interval counts from the earlier PCM16 research fixture; neither Sonoma result is a labelled accuracy reference.

Validation passed with 251 TypeScript tests, 12 Python tests, stdio/HTTP checks and fresh-tarball installation/audit. New tests cover setup reuse, changed trees, retained failed installations, existing/replaced locks, invalid receipts, bounded reads, unsupported clustering settings, offline verification and allowlisted regular-file archive extraction. Model/runtime redistribution notices, current vulnerability audit, persisted speaker tools, corrections, transcript alignment, cancellation/recovery and natural-dialogue accuracy remain open.
