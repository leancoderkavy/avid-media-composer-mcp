# Local speaker diarization candidate

This research evaluates an original wrapper around sherpa-onnx, separating speaker intervals from transcription. The later implementation sections record packaged runtime and MCP additions. It does not identify people or assign names to voices.

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

The branch now packages `python/avid_diarization.py` and provides `--download-models --diarization` plus `--diarization-runtime-status`. The worker retains the pinned model/runtime contract, validates finite bounded PCM and output spans, normalizes anonymous labels by first appearance, and supports automatic or supplied speaker counts. Persisted MCP speaker operations were added in the subsequent increment below. Preparation downloads only the fixed artifacts above, verifies exact sizes/hashes, and extracts only selected regular archive members; it never executes archive contents.

A fresh Windows Python 3.12 installation passed binary-only dependency installation, pip check, model verification and one-second silence inference. Its completed receipt binds the installation tree and packaged worker. The qualification script reused it with a deliberately nonexistent base Python command, verified tree consistency after inference, rejected a deliberate extra file during setup, retained that file until the script removed its own test file, and verified the restored tree. No automatic dependency or model changes occur during reuse.

Actual worker results using the production source-clock extractor:

| Input | Automatic | Supplied two |
| --- | --- | --- |
| Original alternating voices, 29.155 seconds | Eight spans, two labels, dominant A/B/A/B; 4.13 s | Eight spans, two labels, dominant A/B/A/B; 4.16 s |
| Sonoma preview, 190.8666875 seconds | 64 spans, 40 anonymous labels; 26.63 s | 43 spans, two labels; 31.64 s |

Evidence: `.avid-mcp-analysis/diarization-runtime-19994a23-ddde-41f4-af47-2138a523160b/evidence.json`; fresh-install receipt/output: `.avid-mcp-analysis/diarization-production-install.log`. Reproduce with `node scripts/research/qualify-diarization-runtime.mjs` after building and installing the runtime, using the retained original fixture and configured FFmpeg. Sources and installation tree remained unchanged. The float32 production extractor produces different interval counts from the earlier PCM16 research fixture; neither Sonoma result is a labelled accuracy reference.

Validation passed with 251 TypeScript tests, 12 Python tests, stdio/HTTP checks and fresh-tarball installation/audit. New tests cover setup reuse, changed trees, retained failed installations, existing/replaced locks, invalid receipts, bounded reads, unsupported clustering settings, offline verification and allowlisted regular-file archive extraction. Model/runtime redistribution notices, current vulnerability audit, persisted speaker tools, corrections, transcript alignment, cancellation/recovery and natural-dialogue accuracy remain open.


## Persisted MCP speaker analysis

`SpeakerAnalysis` now binds validated worker output to the indexed source, explicit source range, recipe-three PCM extraction and installed runtime/worker checksums. Publication occurs only after rechecking source, PCM and runtime. Saved records support paginated source-time spans, completed-result discovery and checksum-guarded derived-file deletion. Worker validation rejects malformed interval bounds/order, label order, inconsistent speaker counts and mismatched audio/options. Source and extracted-audio checks repeat on reads. These checks establish provenance/consistency, not model accuracy or publisher authentication.

Four MCP tools were added: `avid_diarize_audio`, `avid_speaker_analysis`, `avid_speaker_analyses`, and `avid_delete_speaker_analysis`; `diarization` joins the existing job lifecycle. The job requires export and project-write capabilities. Incomplete runs remain unpublished and currently require a new run; no model checkpoint resume is claimed.

Actual Sonoma MCP qualification cancelled a job before result publication, verified completed-result discovery remained empty, then analyzed source [60,125) with a supplied count of two. The new job returned 14 spans. Three-span pages covered each saved span once, and reconnect returned an identical result. Deletion refused a stale checksum and an unexpected note, retained the note until the script removed its own file, then removed only the verified result and PCM. The source hash was unchanged. Evidence: `.avid-mcp-analysis/speaker-mcp-f8332391-5a97-446a-88bc-89a4fe3aab0d/evidence.json`; reproduce with `scripts/research/qualify-speaker-mcp.mjs` after building and runtime setup.

Full local validation passed with 255 TypeScript tests, 12 Python tests, 115 tools, both MCP transports and fresh-tarball installation/audit. Additional mismatch regression coverage passed afterward. Natural-dialogue accuracy, corrections, transcript alignment, cancellation during each native-model stage, recovery/cleanup and resource/concurrency qualification remain open.


## Read-only transcript overlap alignment

`avid_align_speakers` compares explicit checksum-selected speaker and transcript artifacts. It returns original transcript indices/text/speaker fields, source-range coverage, detected-speech union coverage, simultaneous-speaker time and ranked anonymous overlap candidates. Repeated/overlapping intervals for the same label count only once; different sequential labels remain multiple candidates and simultaneous labels remain ambiguous. Candidate fractions measure time coverage, not confidence. No transcript speaker assignment is applied.

Actual Sonoma MCP qualification generated a new [60,125) analysis and imported the retained recipe-three machine transcript from the prior speech recovery run. After reconnecting with inspect-only access and no model directory, five pages covered 15 intersecting transcript segments: six single-candidate, six overlapping-candidate and three without detected speech overlap. A separate sorted interval-union implementation matched aggregate and returned per-candidate overlap durations. Stale speaker/transcript checksums were refused; both transcript and media hashes remained unchanged. Evidence: `.avid-mcp-analysis/speaker-alignment-e03bb90d-246b-48dd-9ce8-ee64746f7266/evidence.json`; script: `scripts/research/qualify-speaker-alignment.mjs`. The machine transcript contains repetitive, unverified text and is not an accuracy reference. This qualifies artifact selection and interval arithmetic, not word attribution, identity or transcription quality.

Full local checks passed with 260 TypeScript tests, 12 Python tests, 116 MCP tools, both transports and fresh-tarball installation/audit. Unit cases cover same-label union, sequential versus simultaneous candidates, boundary-only contact, gaps, partial-range coverage, explicit candidate truncation, original speaker preservation, pagination and stale references. Label/boundary corrections, applying reviewed assignments, word-level alignment, broader accuracy and recovery remain open.


## Caller-selected transcript speaker assignment

The MCP surface now includes `avid_assign_transcript_speakers` and `avid_transcript_speaker_assignments`. Assignment creates an immutable child transcript, preserves original segment text/timing and untouched speaker fields, and persists the selected analysis/transcript checksums and explicit choices. Anonymous candidates must overlap each chosen segment. Multiple candidates and partial analysis coverage require explicit per-assignment flags; display names are caller supplied, never inferred. These choices are not represented as verified identities. The provenance reader supports bounded pages and old ordinary transcript revisions.

Actual MCP selected five candidates from the retained Sonoma alignment, used clearly marked test display names, and created a new transcript revision without models or export capability. An ambiguous unflagged assignment was refused. Every segment retained its text and timestamps; only selected speaker fields changed. Parent transcript, source media and speaker analysis hashes remained unchanged. After reconnecting with inspect-only access, the new revision appeared with its parent/checksum, three pages recovered all five saved choices, the ordinary parent returned no assignment provenance, and a write attempt was denied. Evidence: `.avid-mcp-analysis/speaker-assignments-73abe2fc-d68e-4e0e-bdc6-82bd9204ffff/evidence.json`; script: `scripts/research/qualify-speaker-assignments.mjs`. This is a persistence/selection test, not a natural-dialogue speaker or transcript accuracy reference.

Unit tests cover partial-range and ambiguous choice requirements, non-overlap, duplicates, conflicting display names, stale references, write capability, parent/source/analysis retention, provenance pagination and old revision compatibility. Full local validation passed with 262 TypeScript tests, 12 Python tests, 118 MCP tools, both transports and fresh-tarball install/audit. Underlying diarization label/boundary corrections, word-level alignment, broader accuracy and recovery remain open.


## Immutable interval and cluster corrections

`avid_correct_speaker_analysis` now applies ordered replace/remove/add/merge operations to a checksum-selected analysis. Corrected records use schema two, retaining the original schema-one model output plus an effective span snapshot and immediate parent ID/checksum. Corrected PCM is copied exclusively and verified before publication; the parent is unchanged. Reads offer effective and original-machine views, and both overlap alignment and transcript assignment use the selected effective spans. Corrections remain caller assertions, not model/identity verification.

Actual MCP used the retained Sonoma analysis without models/export capability. It shortened and relabelled one span, removed another, added an interval, then merged the added cluster in a second child. The machine view exactly matched the original spans. Alignment against a deliberately synthetic text fixture observed the corrected label. After explicitly deleting the intermediate child, reconnect still returned the final child's unchanged effective spans and original machine view. The original analysis and source hashes remained unchanged, and inspect-only correction was refused. Evidence: `.avid-mcp-analysis/speaker-corrections-9985cde4-ae92-4cb1-bca5-a150e339b958/evidence.json`; script: `scripts/research/qualify-speaker-corrections.mjs`. Fixture boundaries/labels are deliberate edits, not speaker-accuracy annotations.

Full checks passed with 264 TypeScript tests, 12 Python tests, both transports and fresh-tarball install/audit (119 tools). After adding ordered-edit/all-removal/overflow regressions, the complete TypeScript suite passed with 266 tests. Coverage also verifies split/merge behavior, preserved model output, corrected assignment, parent-independent reads, stale checksums, source-range limits, missing labels/spans, malformed review records and capability restrictions. Broader accuracy, word-level attribution, interruption recovery, cleanup and concurrency remain open.
