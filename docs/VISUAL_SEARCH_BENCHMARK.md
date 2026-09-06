# Sonoma visual retrieval development benchmark

This benchmark tests text-to-frame retrieval on 32 existing shot-midpoint samples of the 190.866666-second Sonoma preview. The assistant inspected all thumbnails and wrote 16 positive scene queries with relevant sample IDs before executing the queries. Three absent-scene queries were added separately. These are assistant-authored development labels on one video, not independent ground truth, held-out evaluation or full-video appearance coverage. Query selection favors visually distinct scenes.

## Reproduction

Use the existing `sonoma-library-20260905/visual-shots.json` research output and cached CLIP weights. No source footage, thumbnails or weights are committed.

```text
node scripts/research/render-sonoma-visual-sheet.mjs
node scripts/research/benchmark-sonoma-visual-search.mjs
```

Labels are fixed in `scripts/research/sonoma-visual-labels.json`. The renderer produces a labeled 32-frame contact sheet under the ignored analysis directory. The benchmark calls `avid_search_visual` through actual stdio MCP with inspect-only capability, requests all 32 ranks, verifies unique sample mappings, and retains per-query ranks/scores, source identity and thumbnail hashes. It rechecks source and thumbnail hashes afterward. Model: pinned CLIP ViT-B/32, q8. The test writes evidence, not a replacement index.

## Observations

Evidence: `.avid-mcp-analysis/visual-ranking-b9186cd2-7d2f-4be3-b1f7-d7ed3e5f549b/evidence.json`.

| Metric across 16 positive queries | Result |
| --- | --- |
| At least one labeled match at rank 1 | 14/16 (87.5%) |
| At least one labeled match in top 3 | 16/16 |
| At least one labeled match in top 5 | 16/16 |
| Mean reciprocal rank of first labeled match | 0.9375 |
| Mean recall of all labeled samples within top 5 | 0.9271 |

Airplane, hallway, trail, vineyard, pond, utility cart, barrels, food and climbing-wall queries found a labeled match first. The phone-screen and green-umbrella patio queries found one second. The patio query retrieved only one of its three labeled appearances in the top five; the street-gateway query retrieved one of two. A successful first match does not establish complete retrieval of repeated appearances.

Absent scenes also received ranked results:

| Absent query | Top sample | Top cosine score |
| --- | --- | --- |
| Snowboarder on a snowy mountain | Foggy hill, sample 9 | 0.2517 |
| Scuba divers above a coral reef | Outdoor tree/people scene, sample 10 | 0.2087 |
| Person playing a violin | Street close-up, sample 28 | 0.2713 |

The violin score exceeds the best relevant phone-screen (0.2583), parking-lot (0.2668) and patio (0.2681) scores. A single fixed cutoff cannot separate all those cases on this development set. No new threshold was adopted. Search ranks available samples; it does not verify that the requested scene exists.

## Query-length regression

The original tokenizer call enabled truncation. Text search now tokenizes without truncation and rejects input beyond the pinned model's 77 positions, including special tokens, with `VISUAL_QUERY_TOO_LONG` and the actual token count. This prevents silently ignoring a distinguishing suffix. The 500-character tool-input limit remains a separate outer bound.

Actual MCP rejected a 94-token fixture. All 16 positive query rank/score arrays and all three negative query outputs were exactly equal to the previous evidence after this change. Evidence: `.avid-mcp-analysis/visual-ranking-09818354-e617-40a7-8aeb-bc4e7eb44d68/evidence.json`. Unit coverage verifies the 77/78 boundary and that oversized text never reaches text-model inference. This corrects input preservation, not the ranking limitations above.

## Remaining acceptance work

Obtain independent relevance judgments and a held-out set across different source footage. Include subtle actions, paraphrases, negatives, repeated scenes, visually similar distractors and sparse-versus-dense sampling. Measure per-query precision/recall, resource use and end-to-end latency separately. Evaluate any model, reranker or threshold change against the frozen baseline plus held-out data. These results do not close broad ranking accuracy, detector precision/recall, unsampled appearance coverage or calibrated abstention requirements.

## Local unwanted-concept refinement

`avid_search_visual` and `avid_search_visual_frame` accept optional `refinement: { "exclude": ["people"], "weight": 0.5 }`. Up to eight concise concepts are supported; weight defaults to 0.25 and must be between 0 and 1. Each concept uses the same local pinned CLIP tokenizer/model and 77-token limit. Duplicate concepts are evaluated once. Existing searches without exclusions retain their original scores and result shape.

For each sample, the refined score is positive/reference cosine minus weight times the largest nonnegative excluded-concept cosine. Results include `similarity` and `exclusionSimilarity` so this adjustment can be inspected. All samples remain eligible; this is a soft ranking penalty, not a filter or guarantee that unwanted content is absent. Weight zero reproduces unrefined scores/ranking. The weight is a user control, not a calibrated accuracy threshold.

A real local-model MCP probe over the 32 Sonoma samples compared each refined score with separate positive and negative searches and verified zero-weight equivalence. All arithmetic checks passed; the top result stayed at 78.15 seconds for vineyard landscape excluding people. Evidence: `.avid-mcp-analysis/visual-exclusions-4297bd37-f367-4306-8ad8-374dc8c365e1/evidence.json`; script: `scripts/research/qualify-visual-exclusions.mjs`. This establishes runtime behavior, not improved semantic accuracy or independent exclusion ground truth. The original MP4 remained unchanged.

## Combined image/frame and text queries

Use `avid_search_visual` with `query: { "image": "<authorized JPEG/PNG>", "text": "vineyard landscape" }`, or supply optional `text` to `avid_search_visual_frame`. Each result's base score is the equal-weight mean of its image and text CLIP cosine similarities. Returned `imageSimilarity`, `textSimilarity` and `similarity` fields expose the components. Optional exclusion penalties are applied after averaging. Image-only, frame-only and text-only queries retain their previous scoring.

Text limits and token checks also apply to refinement text. Blank or overlong text is refused rather than silently truncated. Frame queries retain export requirements for the reference thumbnail; combined image queries use the existing authorized JPEG/PNG path and byte limits.

A real local CLIP/MCP run independently compared image-only and text-only scores with all 32 combined Sonoma results. Actual source-frame extraction and its combined search passed the same check; a scoped query returned six samples in [60,90) and passed combined-score/exclusion arithmetic. Original source and supplied reference image hashes were unchanged. Evidence: `.avid-mcp-analysis/visual-combined-78392283-2964-43aa-aabe-ba5a2713ef55/evidence.json`; script: `scripts/research/qualify-visual-combined.mjs`. Equal weighting is an explicit scoring choice, not a calibrated probability or independently demonstrated ranking-quality improvement.

Frame-query text and exclusion token limits are now checked before reference extraction. Real MCP overlong-query probes left the library file inventory unchanged, while the combined-image/frame scoring checks continued to pass: `visual-combined-69754d86-d6a6-4023-8da1-3312e8ca87cd`. This avoids creating thumbnails for requests that cannot fit the model context.

## Source-content validation on saved reads

Saved visual sample reads and searches now require an authorized source whose SHA-256 matches the indexed content ID. Replacing bytes at the original path no longer silently reuses old visual results. A registered matching alias can satisfy the check, but it must remain inside the current allowed roots. Hashes are checked sequentially once per distinct source before reading results or inference; this adds source I/O to cached queries, especially for large multi-file indexes.

Generated-file MCP tests verified changed-source refusal for sample, text-search and source-frame operations; matching-alias indexing restored identical search output without re-embedding. A narrower allowed root and changes to both copies were refused. Evidence: `.avid-mcp-analysis/visual-scope-e44daeaa-fe01-49d9-b0f4-407f2b3f4d57/evidence.json`. Only generated fixture files were altered. This validates source identity at the read check, not arbitrary concurrent-writer exclusion or thumbnail/index tamper resistance.
