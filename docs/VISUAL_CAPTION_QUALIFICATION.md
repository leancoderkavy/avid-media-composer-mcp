# Visual caption and summary qualification

Visual grounding remains open: production summaries currently summarize transcripts. This experiment evaluates original local caption generation as a possible visual input to later summaries; Florence now also has a bounded frame-caption implementation described below; hierarchical visual summaries remain open.

The [SmolVLM-256M model card](https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct) declares Apache-2.0 and provides ONNX weights. The [Florence-2 ONNX card](https://huggingface.co/onnx-community/Florence-2-base-ft) declares MIT and documents its caption tasks. Final distribution/provenance review is still required before shipping optional integrations. Weights remain in the ignored optional cache, outside the package.

Run `node scripts/research/benchmark-vision-captions.mjs [--model=florence] [--download]`. Downloads require the explicit flag; cached runs use local files only. The existing pinned Transformers.js 4.2.0 runtime is used. Eight previously inspected Sonoma shot-midpoint images are selected (0, 6, 13, 14, 18, 21, 26, 29); their prior labels are retained but never passed to the model. This is an assistant-reviewed development sample, not a held-out or independent evaluation. Image and source hashes are checked before/after. Generated text, token counts, prompt/task, timing and sampled process RSS are retained.

## SmolVLM-256M q4

Revision: `7e3e67edbbed1bf9888184d9df282b700a323964`. A two-sentence visible-content prompt requests no guesses about names, places, intentions or off-image events. Greedy generation is capped at 128 new tokens.

Evidence: `.avid-mcp-analysis/vision-caption-ead203c8-7f4b-456d-a2de-664cf8a547b2/evidence.json`.

| Frame | Observed result |
| --- | --- |
| Airplane window | Recognized the wing/window, with awkward wording. |
| Hallway/bedroom | Mentioned bed, picture and door; repeated positional phrasing and exceeded the two-sentence request. |
| Vineyard | Described trees/flowers but omitted grapevine rows. Flowers are visible on closer inspection; their mention alone is not a demonstrated hallucination. |
| Pond | Described plants in water, consistent but vague. |
| Barrels | Returned only a statement that lighting was dark; omitted the main subject. |
| Noodles | Recognized noodles and a bowl; additional packaging details require review. |
| Phone | Recognized the held phone, then repeated standing-person statements until the 128-token cap, ending unfinished. |
| Climbing wall | Recognized the person on the climbing wall. |

Generation including preprocessing took 7.0–10.8 seconds per frame. Sampled process RSS peaked at 4,463,718,400 bytes (about 4.16 GiB), excluding unsampled loading peaks. This model is not accepted for production visual summaries: main-subject omissions and repetition would propagate into summaries. These findings do not measure general caption accuracy.

## Florence-2-base-ft q4

Revision: `e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f`. Evaluated `<DETAILED_CAPTION>` and `<MORE_DETAILED_CAPTION>` with greedy generation capped at 128 new tokens. The more-detailed variant is selected by `--model=florence --more-detailed`. Its task prompt differs from SmolVLM's instruction prompt; this comparison holds images constant, not prompt semantics or architecture.

Detailed-caption evidence: `.avid-mcp-analysis/vision-caption-f4ad416a-dced-40e6-a0d4-8d31ff93dd0e/evidence.json`. More-detailed cached run: `.avid-mcp-analysis/vision-caption-98c1189c-e281-4200-bff5-c91d2e561657/evidence.json`.

| Scene | Detailed mode | More-detailed mode |
| --- | --- | --- |
| Airplane | Wing and sky | Wing/window and landscape details |
| Hallway | Listed room objects | Focused on bedroom; awkward/conflicting picture placement |
| Vineyard | Generic trees/plants/ground/sky | Trees/flowers/hill; grapevines still omitted |
| Pond | Plants/fence/water | Named pond and surrounding plants |
| Barrels | Identified barrels but described them on the ground | Described stacked barrels on a rack |
| Noodles | Generic food/container/table | Generic food/container/table; noodles omitted |
| Phone | Held phone and background subjects | Held phone with additional details requiring review |
| Climber | Incorrectly described sitting | Described standing on a surface; climbing action still missed |

Detailed mode took 1.08–1.33 seconds per frame and sampled 1,756,831,744 bytes peak RSS. More-detailed mode took 1.19–1.35 seconds and sampled 1,818,406,912 bytes peak RSS. Both preserved source and sample hashes. These timings include image preprocessing/generation, exclude model loading, and are observations on this host rather than a resource guarantee.

Florence is the stronger candidate here for a bounded caption workflow that exposes each source image for review: it avoids the observed repetition and recognizes more core objects with lower latency/memory. It is not accepted for unattended factual visual summaries. The experiment itself did not add captions to the media library or existing summaries. The subsequent frame-caption implementation adds scoped extraction, recorded provenance, explicit model installation, source-image review, correction and deletion; hierarchical integration and broader accuracy/recovery qualification remain open.

Selected-time batches now save each caption checksum as a recovery checkpoint. Actual MCP cancellation/reconnect resumed one caption into 12 Sonoma timestamps and exactly matched an uninterrupted run's machine text and sampled-image hashes, preserving parent/source bytes. Evidence: .avid-mcp-analysis/caption-batch-0e41594b-4081-40aa-a918-dbfca87795b5/evidence.json. This qualifies that recovery path, not caption accuracy or automatic shot coverage. Referenced caption edits invalidate historical run verification. Hierarchical visual summaries remain open.

## Hierarchical integration and observed quality

The subsequent visual-summary implementation accepts explicit caption/checksum pairs, preserves caption text at leaves and generates four-child parent summaries with DistilBART. Overview/node reads include verified descendant caption records and image paths. Changed captions invalidate previous summary reads; corrected checksums can be selected for a new summary.

Actual MCP evidence: `.avid-mcp-analysis/visual-summary-cee6df48-f7b8-4620-85e6-c931d8ade1f8/evidence.json`. Twelve Sonoma captions produced 16 nodes. Reconnect reads/discovery, source/caption/image checks, exact leaf text, duplicate/checksum rejection and summary-only deletion passed. Sources/captions were preserved.

Quality did not pass: the overview repeated sky details and omitted later scenes, ending mid-sentence. The "3D image" vineyard characterization originated in the Florence caption at 80 seconds and propagated into the root. Directly inspecting its saved JPEG showed vineyard rows, a central tree and shadows without evidence for that characterization. This is a concrete example of caption error propagation through an otherwise traceable hierarchy. The generated root is marked for review and factual entailment remains unverified. This increment implements integration; it does not close unattended visual-summary accuracy, per-node recovery or broader resource/coverage requirements.

## Separating caption errors from summary errors

`scripts/research/benchmark-visual-summary-quality.mjs` compares the same four-child hierarchy using the 12 retained machine captions and a separate set of reference descriptions. The assistant visually inspected all 12 saved JPEGs before writing `scripts/research/sonoma-caption-review.json`; these are development references, not independently labelled held-out data. Original media, captions and images were not edited.

Evidence: `.avid-mcp-analysis/visual-summary-quality-2faaee97-da6b-4948-89ac-4b143bbbcfb3/evidence.json`. The cached Qwen3-1.7B ONNX q4 candidate uses revision `cc6a06a21d614e9b8e92a6adfab1074d4e7d2438`, a non-thinking chat template and deterministic generation capped at 384 new tokens. Parent prompts request every distinct scene in supplied order without inferred identities, intentions or continuity. DistilBART comparisons use the reviewed captions and both 80- and 384-token limits with greedy generation. All inputs and intermediate outputs are retained.

| Condition | Observed overview result |
| --- | --- |
| Qwen, machine captions | Retained the first four scenes only; the later eight scenes were omitted from the root despite their source indices remaining in the graph. |
| Qwen, reviewed captions | Retained 11 of 12 main scenes in order. The sidewalk scene with white tablecloths and yellow chairs was already omitted by its first generated parent, then remained absent at the root. Wording such as "another person" and "a third person" also implies distinct identities that the descriptions do not establish. |
| DistilBART, reviewed captions, 80 tokens | Retained sidewalk dining, patio and phone details but omitted most scenes, repeated "restaurants", reordered details and ended without terminal punctuation. |
| DistilBART, reviewed captions, 384 tokens | Exact same overview and intermediate text as the 80-token variant; a larger requested budget did not fix this failure. |

The 11/12 scene count is a manual main-scene coverage observation on this development set, not factual accuracy or a general acceptance rate. In particular, a valid graph can retain every source index while generated text omits their content. The reviewed-caption condition changes both correctness and length/detail of the input, so this experiment does not isolate those two factors.

Qwen cached loading took 4.274 seconds; its eight parent calls took 5.661–22.699 seconds each, with sampled generation process RSS reaching 4,809,457,664 bytes (about 4.48 GiB). DistilBART parent calls took 1.616–2.046 seconds here. The memory sampling excludes unsampled load peaks and is not a clean-machine requirement. Source/image hashes were unchanged.

Neither candidate nor a larger production output budget is adopted from this result. Next quality work needs better preservation of short, distinct input scenes, explicit checks against unsupported identity/continuity claims, and independent footage/reference sets. Caption review remains necessary but alone does not prevent later summary omissions.
