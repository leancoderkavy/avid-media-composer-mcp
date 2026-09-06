# Optional model provenance inventory

Run `node scripts/research/audit-model-provenance.mjs` after building to inspect the exact five Hugging Face revisions configured for visual search, summaries, captions and speech. The script checks returned commit identity, bounds each metadata/notice response to 2 MiB, and records notice URLs and SHA-256 values. It downloads metadata and notice text only, not model weights. `model-provenance-inventory.json` retains the verified results.

The inspected conversion repositories contained README files but no separately named LICENSE or NOTICE files. Their model-card license declarations were:

| Conversion | Declaration at configured revision |
| --- | --- |
| Xenova/clip-vit-base-patch32 | Absent |
| Xenova/distilbart-cnn-6-6 | apache-2.0 |
| onnx-community/Florence-2-base-ft | mit |
| onnx-community/whisper-tiny.en | Absent |
| onnx-community/whisper-tiny | Absent |

Each exact metadata source and pinned README URL appears in the JSON inventory. Absent metadata is not a conclusion that a model lacks a license; a declared identifier is not a complete upstream notice or redistribution audit. The remaining work is to establish each conversion's original-model provenance, retain applicable license and attribution text, check conversion-specific terms, and cover associated runtime dependencies. The face models have separate exact-notice verification described in `FACE_MODEL_PROVENANCE.md`. Diarization models and runtime dependency licenses are outside this five-model inventory.

Local evidence: `.avid-mcp-analysis/model-provenance-69074306-48e5-4aff-a0ec-fafb25106d46/evidence.json`. This audit did not modify the installed model cache or disable existing features.
