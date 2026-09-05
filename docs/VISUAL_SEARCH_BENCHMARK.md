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

## Remaining acceptance work

Obtain independent relevance judgments and a held-out set across different source footage. Include subtle actions, paraphrases, negatives, repeated scenes, visually similar distractors and sparse-versus-dense sampling. Measure per-query precision/recall, resource use and end-to-end latency separately. Evaluate any model, reranker or threshold change against the frozen baseline plus held-out data. These results do not close broad ranking accuracy, detector precision/recall, unsampled appearance coverage or calibrated abstention requirements.
