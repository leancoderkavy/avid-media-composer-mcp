# Diarization native component evidence

This records the 2026-09-05 Windows inspection of the new pip-bootstrap runtime. It extends the Python-distribution audit; it does not establish complete binary provenance, vulnerability coverage or redistribution acceptance.

## Direct observations

The imported sherpa module reports version 1.13.7, Git identifier `917bed95`, and ONNX Runtime 1.27.1. GitHub resolves that identifier to `917bed95c8e5c7c18aa4d69fea42e9ef8ef0a60e`. NumPy's build configuration reports OpenBLAS 0.3.29, Windows x86_64 and MSVC 19.29.30159. The [matching ONNX Runtime recipe](https://github.com/k2-fsa/sherpa-onnx/blob/917bed95c8e5c7c18aa4d69fea42e9ef8ef0a60e/cmake/onnxruntime-win-x64.cmake) references the same runtime version. Version strings and source recipes are evidence of intended build inputs, not reproducible-build attestation.

The inventory hashes 28 DLL/PYD entries listed by the installed sherpa wrapper, sherpa core and NumPy distributions, including copied DLL locations. Three entries contain specific eSpeak/phonemizer strings and source-file references: the Python extension and two copies of the C API DLL. A broad substring search would also match words such as OfflineSpeaker; the recorded probe instead searches `espeak_`, `espeak-ng`, `espeakng` and `phonemize` to avoid that false inference.

The matching [top-level build](https://github.com/k2-fsa/sherpa-onnx/blob/917bed95c8e5c7c18aa4d69fea42e9ef8ef0a60e/CMakeLists.txt) enables TTS by default and includes the phonemizer dependencies when enabled. Its [eSpeak recipe](https://github.com/k2-fsa/sherpa-onnx/blob/917bed95c8e5c7c18aa4d69fea42e9ef8ef0a60e/cmake/espeak-ng-for-piper.cmake) pins fork commit `ed530aa113046142eb5115cf2fc9157854d0ffe1`, whose [COPYING file](https://github.com/csukuangfj/espeak-ng/blob/ed530aa113046142eb5115cf2fc9157854d0ffe1/COPYING) contains GPL version 3. Together, these observations indicate that the downloaded general-purpose wheels include phonemizer code beyond the diarization functions used here. The sherpa wrapper's Apache declaration must not be presented as a complete description of every bundled component's terms. Exact link inputs and the complete applicable notice/source inventory remain unresolved.

Fifteen source/notice files were captured with URLs, byte counts and hashes: sherpa's license/root build, nine selected dependency recipes, the eSpeak license, ONNX Runtime license and third-party notices, and OpenBLAS license. These include first-level recipes for clustering, Kaldi, OpenFST, sentencepiece and Eigen; capturing a recipe does not prove that every listed component was linked into this wheel. ONNX Runtime and OpenBLAS were resolved to their matching version-tag commits for the advisory lookup below.

## Advisory queries

The [OSV commit-query API](https://google.github.io/osv.dev/post-v1-query/) was queried for these source revisions, with pagination support. Each returned zero entries at inspection time:

| Source | Commit |
| --- | --- |
| sherpa-onnx | 917bed95c8e5c7c18aa4d69fea42e9ef8ef0a60e |
| ONNX Runtime v1.27.1 | df2ba1cf8108aa63627cf4cdf8f807880b938616 |
| OpenBLAS v0.3.29 | 8795fc7985635de1ecf674b87e2008a15097ffab |
| eSpeak fork selected by recipe | ed530aa113046142eb5115cf2fc9157854d0ffe1 |

An empty source-commit response does not establish that OSV covers that repository, all vendored libraries, compiler/runtime components or the actual binary's complete dependency graph. The exact PyPI lookup for `onnxruntime/1.27.1` returned HTTP 404 and is explicitly recorded as unavailable, not zero advisories. The earlier four-Python-package scan therefore did not cover this native runtime as an installed Python distribution.

## Reproduction and remaining work

Run `node scripts/research/audit-diarization-native.mjs <MODEL_CACHE>` after building. The script reads the selected runtime receipt, imports the native version APIs, hashes wheel-owned binaries, retrieves exact source/notice files, performs bounded advisory requests and verifies the installed tree stayed unchanged. The Python probe is Windows DLL/PYD-specific. Scripts never modify the target installation or run fetched source/build files.

Evidence: `.avid-mcp-analysis/diarization-native-267d843a-0b17-4b73-9e5b-558aada73339/evidence.json`. All 15 source requests succeeded; the separate PyPI request failed as described. The runtime tree remained unchanged. An earlier preliminary probe is not the final commit-query evidence.

Remaining release work: complete wheel build/link manifests and native dependency coverage, component notice and corresponding-source inventory, exact converted-model notices, equivalent Mac/Linux inspection, and a qualified distribution approach for the optional wheels. The project's own wrapper source remains MIT; optional downloaded components retain their own terms. No wheel/model binaries, fetched source trees or third-party license payloads are bundled by this research increment. Recovery, cleanup, accuracy and the rest of the completion ledger also remain open.
