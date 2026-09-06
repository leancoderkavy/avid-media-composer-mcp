# Whisper base candidate qualification

The original research harness `scripts/research/qualify-speech-base.mjs` compares the production tiny multilingual model with `onnx-community/whisper-base` at fixed revision `1846881b6b3a3024392c1eea3ad983695bc23925`, both q8. The candidate's [model card](https://huggingface.co/onnx-community/whisper-base) identifies `openai/whisper-base` as its source and provides ONNX weights for Transformers.js. This began as a research-only candidate; subsequent optional production integration is recorded below.

The harness explicitly permits setup/downloads for the candidate, reuses the retained original Mandarin voice fixture, decodes both inputs identically with the production audio argument builder, and records complete model output plus loading and inference duration. It checks the source checksum before and after. It requires the existing retained fixture and configured local runtime/cache, so it is not a portable clean-machine benchmark.

| Model | Inference time | Raw character edits | Reference characters |
| --- | ---: | ---: | ---: |
| tiny | 926 ms | 13 | 41 |
| base | 1323 ms | 13 | 41 |

The full concatenated text was identical. Segment boundaries differed; no independent timing reference was available, so neither timing output is declared more accurate. Raw CER was 31.7% for both, using NFKC and punctuation/whitespace removal without script or numeral conversion. The same traditional-character and Arabic-numeral differences seen in the earlier tiny probe account for orthographic differences; this must not be described as 13 spoken-content mistakes. One synthetic voice is insufficient to assess model ranking, mixed-language speech, noise, speakers or general accuracy. These single-run durations are observations, not repeatable hardware benchmarks; loading durations include runtime/cache/download work.

Evidence: `.avid-mcp-analysis/speech-base-comparison-0e31cb02-5726-409e-8a20-b4a2de550a9e/evidence.json`; log: `.avid-mcp-analysis/speech-base-comparison.log`. Both models loaded and disposed successfully, and the source hash remained unchanged. Next acceptance work includes diverse grounded speech fixtures, reference timing, resource/failure behavior and checkpoint compatibility before adding a production choice.

## English dialogue and noise follow-up

`qualify-speech-base-english.mjs` generates an original 58-word editorial passage with the installed Microsoft David Desktop voice and a second version mixed with deterministic pink noise (generator amplitude 0.12, seed 17, mixing normalization disabled). Both variants use the same reference. The generator amplitude is not a measured SNR. The comparison harness now accepts an explicit fixture JSON with absolute file path, checksum, reference and en/zh language, and reports English word edits after NFKC, lowercasing, punctuation-to-space conversion and whitespace splitting.

| Condition | Tiny word edits | Base word edits | Tiny inference | Base inference |
| --- | ---: | ---: | ---: | ---: |
| Clean | 0/58 | 1/58 | 1364 ms | 1926 ms |
| Pink-noise mix | 0/58 | 1/58 | 1354 ms | 1822 ms |

Base substituted `closed shot` for the reference `close shot` in both conditions; tiny matched the normalized reference. The outputs and source hashes were retained, and both input hashes remained unchanged through comparison. These two conditions use one synthetic voice and one noise level. They do not establish real-speaker robustness, model-wide ranking, calibrated timing or repeated hardware performance. These results did not justify changing the production default.

Fixture evidence: `.avid-mcp-analysis/speech-english-fixtures-d6ae59e4-b323-4927-8907-27fe6c6ab59a/evidence.json`. Clean comparison: `speech-base-comparison-b0e604f0-98f7-4e31-92ce-476fc1b65dbf`; noisy comparison: `speech-base-comparison-e64e042b-5c11-4bd1-9a4d-0af21fc6c6ee`, both under `.avid-mcp-analysis`. The original Mandarin default remains available when no fixture argument is passed.

## Optional MCP integration

Production transcription and speech jobs now accept `model: "base"`, retaining the tiny.en default. Explicit setup uses the pinned q8 weights and retained Whisper notice. Automatic transcription language selection uses the selected base model rather than requiring a separately installed tiny model. The independent language-detection tool remains tiny-based. Checkpoint validation binds the base model/revision and selected language through the existing recipe.

Build and 28 selected tests passed. Actual CLI setup and MCP explicit-en/auto transcription passed on the retained clean-English fixture, and saved run reads reported completed base runs with the expected language decisions. Source unchanged. Evidence: `.avid-mcp-analysis/speech-base-mcp-555476e4-0e0f-42fd-8e19-a7b04c0bcc10`; harness: `qualify-speech-base-mcp.mjs`.

## Sonoma cancellation and resume

`node scripts/research/qualify-speech-resume.mjs --base` passed against 180 seconds of the Sonoma MP4 with automatic language selection. The actual MCP worker was cancelled after one of nine windows was saved. After disconnecting and reconnecting, the saved parent status matched; the resumed job reused that window and completed all nine. All 54 resulting segments matched an uninterrupted base run exactly. The persisted language decision, parent checkpoint bytes and source checksum remained unchanged, and resuming the completed run was rejected.

Evidence: `.avid-mcp-analysis/speech-resume-3e895d43-c00e-4e2c-9496-68aee2e7d352/evidence.json`. The speech test suite also passed all 12 tests, including base failure recovery and persistence of automatic language selection without redetection. This qualifies controlled worker cancellation and reconnect on this fixture. Abrupt host termination, power loss, long-media resource behavior, broad speech accuracy and independently grounded timing remain unqualified.

## Forced Windows process-tree termination

The follow-up command `node scripts/research/qualify-speech-resume.mjs --base --host-tree-kill` passed. It takes the PID directly from its owned MCP transport, invokes Windows `taskkill /T /F`, requires successful command completion and transport closure, then reconnects. The retained Windows output confirms termination of the host and its descendants. It does not terminate Avid or other MCP sessions.

One saved window was reused and all nine windows completed; all 54 segments matched uninterrupted base inference. The parent checkpoint bytes, saved language decision and source checksum remained unchanged, and completed-run resume was rejected. Evidence: `.avid-mcp-analysis/speech-resume-53138de8-7950-4c98-896e-e60c2d27dda1/evidence.json`. This qualifies forced termination of the complete owned process tree after saved progress on this fixture. Parent-only termination with a surviving worker, interruption during each filesystem publication phase, power loss, long-media resource behavior and broad accuracy remain separate gaps.
