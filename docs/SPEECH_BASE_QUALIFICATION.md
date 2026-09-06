# Whisper base candidate qualification

The original research harness `scripts/research/qualify-speech-base.mjs` compares the production tiny multilingual model with `onnx-community/whisper-base` at fixed revision `1846881b6b3a3024392c1eea3ad983695bc23925`, both q8. The candidate's [model card](https://huggingface.co/onnx-community/whisper-base) identifies `openai/whisper-base` as its source and provides ONNX weights for Transformers.js. The candidate remains research-only; production model selection is unchanged.

The harness explicitly permits setup/downloads for the candidate, reuses the retained original Mandarin voice fixture, decodes both inputs identically with the production audio argument builder, and records complete model output plus loading and inference duration. It checks the source checksum before and after. It requires the existing retained fixture and configured local runtime/cache, so it is not a portable clean-machine benchmark.

| Model | Inference time | Raw character edits | Reference characters |
| --- | ---: | ---: | ---: |
| tiny | 926 ms | 13 | 41 |
| base | 1323 ms | 13 | 41 |

The full concatenated text was identical. Segment boundaries differed; no independent timing reference was available, so neither timing output is declared more accurate. Raw CER was 31.7% for both, using NFKC and punctuation/whitespace removal without script or numeral conversion. The same traditional-character and Arabic-numeral differences seen in the earlier tiny probe account for orthographic differences; this must not be described as 13 spoken-content mistakes. One synthetic voice is insufficient to assess model ranking, mixed-language speech, noise, speakers or general accuracy. These single-run durations are observations, not repeatable hardware benchmarks; loading durations include runtime/cache/download work.

Evidence: `.avid-mcp-analysis/speech-base-comparison-0e31cb02-5726-409e-8a20-b4a2de550a9e/evidence.json`; log: `.avid-mcp-analysis/speech-base-comparison.log`. Both models loaded and disposed successfully, and the source hash remained unchanged. Next acceptance work includes diverse grounded speech fixtures, reference timing, resource/failure behavior and checkpoint compatibility before adding a production choice.
