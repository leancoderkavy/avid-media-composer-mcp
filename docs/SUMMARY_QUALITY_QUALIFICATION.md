# Summary quality qualification

The pinned local DistilBART model is implemented and runtime-tested. Its editorial quality is **not accepted as complete**. Tree/source-reference validation and successful resume establish structure and execution, not accurate or comprehensive prose.

## Three-fixture comparison

`scripts/research/benchmark-summary-generation.mjs` runs three original synthetic editorial texts through cached weights, retaining input text, output text, requested/effective settings, elapsed time and simple repetition/terminal-punctuation diagnostics. It instruments the locally installed runtime only for observation; it does not modify the runtime package or production generation settings.

Model: `Xenova/distilbart-cnn-6-6`, revision `6b476295a3cf27d5b20e8c8b847a54ab8e5d0df9`. Runtime: Transformers.js 4.2.0. Baseline uses 80 maximum new tokens and one beam; the candidate requested 160 maximum new tokens, four beams, a three-token repetition constraint and early stopping. Both use deterministic generation. Observed effective settings matched the requested token/beam values. The baseline already inherited a three-token repetition constraint from the model configuration.

Evidence: `.avid-mcp-analysis/summary-generation-ab146037-6b86-4203-b85a-f3cee7f0eced/evidence.json`. Candidate and baseline produced identical text for all three fixtures. Runtime was approximately 1.6 seconds per generation on this Windows machine; this small warm-cache comparison is not a resource benchmark.

| Fixture | Manual source/output comparison |
| --- | --- |
| Editorial decisions | Retained the delivery owner, duration/date, cellar/music decisions and rejected drone reshoot. Omitted the instruction for Leo to remove the noisy roadside interview. |
| Negation and numbers | Retained version approval, publication prohibition, delivery time and no-new-filming decision. Omitted the forty-five-second duration, Nina's caption-review assignment and Omar's stereo-review assignment. Repeated wording and ended with the unfinished phrase “Do not release”. |
| Repeated notes | Retained the three main topics but produced repetition and awkward wording, including “music against music” and “footage..”. Terminal punctuation and repeated-four-gram counts did not adequately describe this poor prose. |

The fixture with repetitive notes is deliberately artificial. These findings must not be generalized to all footage, transcripts or languages. No numerical factual-accuracy score or acceptance threshold is inferred from this set. Increasing the requested output budget and beams did not demonstrate improvement, so the candidate was not adopted and existing checkpoint recipes were not changed.

## Instruction-model candidate

Evaluated `onnx-community/Qwen3-0.6B-ONNX`, revision `da1453100cf3ff33ef56d17983fc7a8648706db6`, q4 weights on the local CPU. The [conversion card](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX) identifies the upstream model; the [upstream Qwen card](https://huggingface.co/Qwen/Qwen3-0.6B) declares Apache-2.0. Weights were downloaded only into the ignored optional cache and are not bundled or integrated. Final converted-weight licensing/provenance review remains required before release integration.

`scripts/research/benchmark-instruction-summary.mjs` accepts a baseline evidence file, reuses its exact fixture text, disables thinking in the chat template and requests deterministic generation capped at 384 new tokens. Downloads require `--download`; the second evaluation loaded cached files only. Evidence: `.avid-mcp-analysis/instruction-summary-674a7455-44f1-48ca-b76f-c0e8338ffc25/evidence.json`.

| Prompt | Observed result |
| --- | --- |
| Concise paragraph | Recovered the roadside-interview removal and produced clean prose for repeated notes. Still omitted version approval, publication prohibition and delivery time in the negation fixture. |
| Compact decision list | Recovered those missing details in the negation fixture. Added unsupported category labels to the editorial fixture and returned category names instead of source facts for repeated notes. |

Cached model load took 2.152 seconds. Six generation calls took 1.665–6.893 seconds each. Peak process RSS sampled during generation was 2,470,891,520 bytes (about 2.30 GiB); this excludes unsampled loading peaks and is not a clean-machine resource guarantee. Prompt format affected omissions and fabrication. The candidate was not adopted: these fixtures do not support replacing the production summary model or relaxing review requirements.

## Remaining work

Evaluate better local summary models or generation strategies against a larger, varied set of permissioned editorial transcripts. Review factual support, essential decisions, negation, names/numbers, assignment attribution, repetitions and incomplete sentences. Preserve human-reviewed reference decisions and distinguish acceptable compression from consequential omissions. Measure memory, latency and long-input behavior. Visual-only grounding and broader language coverage remain separate requirements. Keep all summaries review-required until that evidence supports stronger claims.
