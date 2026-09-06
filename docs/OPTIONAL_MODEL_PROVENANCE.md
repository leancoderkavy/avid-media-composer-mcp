# Optional model provenance inventory

Run `node scripts/research/audit-model-provenance.mjs` after building to inspect the exact six Hugging Face revisions configured for visual search, summaries, captions and speech. The script checks returned commit identity, bounds each metadata/notice response to 2 MiB, and records notice URLs and SHA-256 values. It downloads metadata and notice text only, not model weights. `model-provenance-inventory.json` retains the verified results.

The inspected conversion repositories contained README files but no separately named LICENSE or NOTICE files. Their model-card license declarations were:

| Conversion | Declaration at configured revision |
| --- | --- |
| Xenova/clip-vit-base-patch32 | Absent |
| Xenova/distilbart-cnn-6-6 | apache-2.0 |
| onnx-community/Florence-2-base-ft | mit |
| onnx-community/whisper-tiny.en | Absent |
| onnx-community/whisper-tiny | Absent |
| onnx-community/whisper-base | Absent |

Each exact metadata source and pinned README URL appears in the JSON inventory. Absent metadata is not a conclusion that a model lacks a license; a declared identifier is not a complete upstream notice or redistribution audit. The remaining work is to establish each conversion's original-model provenance, retain applicable license and attribution text, check conversion-specific terms, and cover associated runtime dependencies. The face models have separate exact-notice verification described in `FACE_MODEL_PROVENANCE.md`. Diarization models and runtime dependency licenses are outside this six-model inventory.

Local evidence: `.avid-mcp-analysis/model-provenance-69074306-48e5-4aff-a0ec-fafb25106d46/evidence.json`. This audit did not modify the installed model cache or disable existing features.

## Declared upstream models

The audit now follows each conversion card's explicit `base_model` field. It records an observed upstream commit and hashes notice files at that immutable URL. This is the upstream state observed during this audit, not proof of the revision originally used for conversion.

| Conversion family | Declared upstream | Observed metadata license |
| --- | --- | --- |
| CLIP | openai/clip-vit-base-patch32 | Absent |
| DistilBART | sshleifer/distilbart-cnn-6-6 | apache-2.0 |
| Florence | microsoft/Florence-2-base-ft | mit |
| Whisper English | openai/whisper-tiny.en | apache-2.0 |
| Whisper multilingual | openai/whisper-tiny | apache-2.0 |
| Whisper base | openai/whisper-base | apache-2.0 |

The observed Florence upstream includes a standalone [license notice](https://huggingface.co/microsoft/Florence-2-base-ft/raw/f6c1a25888ffc1d945ee8a1a77ac833c7303d46e/LICENSE). Its exact bytes, including Microsoft attribution, are retained as `docs/licenses/florence-2-base-ft.LICENSE`; SHA-256 `c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383`. No original upstream revision is asserted for the ONNX conversion. The other observed upstream repository listings supplied README files rather than separate LICENSE/NOTICE files, so their original project notices still need to be reconciled. Metadata declarations alone are not the final licensing determination.

Updated evidence: `.avid-mcp-analysis/model-provenance-70328b00-8f7e-43d8-a868-33ee46022652/evidence.json`. No runtime or installed-cache changes were made by this inventory extension.

## Original project notices

The original [Whisper project](https://github.com/openai/whisper#license) expressly identifies its code and model weights as MIT-licensed. Its inspected Hugging Face model-card metadata declares Apache-2.0. These are distinct source observations; the inventory retains both rather than silently treating the metadata identifier as the complete terms of the original weights or ONNX conversion.

The original [CLIP project](https://github.com/openai/CLIP) supplies an MIT notice with OpenAI attribution. Exact original CLIP and Whisper notices are bundled under `docs/licenses/`; `original-model-notices.json` records immutable source URLs, observed commits, byte lengths and SHA-256 values. The same manifest records the previously retained Florence notice. Those observed project commits do not establish the historical commits used for conversion.

Fresh-package smoke now checks all three original-project notices against the recorded bytes, in addition to the two face-model notices. This proves notice inclusion and integrity, not complete conversion-chain or runtime license clearance. DistilBART's original notice chain, conversion-specific obligations, runtime dependencies and model-cache notice delivery remain outstanding.

## Summary setup license text

Explicit DistilBART setup now retains the standard [Apache-2.0 license text](https://www.apache.org/licenses/LICENSE-2.0.txt), matching the declarations observed in the [upstream model card](https://huggingface.co/sshleifer/distilbart-cnn-6-6) and pinned conversion inventory. The exact downloaded bytes are bundled in `docs/licenses/apache-2.0.LICENSE`: 11,358 bytes, SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`. This is standard license text, not an original model-specific attribution notice; no copyright holder or missing historical conversion revision is invented.

The existing exclusive publication/checksum checks apply to the revision-scoped cache file. Offline summary loading remains read-only. The helper reports the narrower scope for this model explicitly. Original attribution-chain reconciliation, conversion obligations, training-data provenance and runtime dependency review remain open.

Build and 27 focused tests passed across summary behavior, model-notice filesystem checks and loader boundaries. Actual `--download-models --summaries` setup loaded/disposed the pinned model and retained the notice in the existing cache; log: `.avid-mcp-analysis/summary-notice-setup.log`. This proves setup integration, not clean-machine installation or summary factual quality.
