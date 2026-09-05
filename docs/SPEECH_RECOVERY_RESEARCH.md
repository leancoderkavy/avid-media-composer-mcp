# Speech computation recovery research

This records the initial recovery experiment. The branch now implements persisted speech runs and explicit MCP resume; the production qualification below is separate from the earlier model-reload experiment.

The installed Transformers.js 4.2.0 ASR pipeline builds 30-second feature windows with five-second strides, generates tokens sequentially, and merges the resulting tokens with the tokenizer. Independently transcribing disjoint windows would change that merge behavior. The experiment instead saves one generation result and replays that result through the same pipeline after disposing and reloading the model. No dependency source is modified.

## Reproduction and observed result

Run `node scripts/research/qualify-speech-token-resume.mjs --model=tiny.en`, or select `--model=tiny --language=en` / `--language=auto`. Models must already be explicitly downloaded. The script reads Sonoma seconds 60–125, extracts mono 16 kHz float audio, runs an uninterrupted baseline, interrupts before the second generation, reloads the model and resumes with one saved token tensor. It writes only a new research directory and does not import transcripts or modify media.

All three configurations passed: three baseline generation calls, one saved result reused, two new generation calls. Full text and every segment timestamp were exactly equal to the baseline. The original source and checkpoint were unchanged. Fingerprints distinguish changed feature bytes, frame counts and language parameters.

Evidence under `.avid-mcp-analysis`:

- English model: `speech-token-resume-7bdf8f7d-a370-4e45-955c-9a3d717e7745/evidence.json`
- Multilingual, explicit English: `speech-token-resume-9c1de508-7ed7-4fa0-8109-a0eb699e5d48/evidence.json`
- Multilingual, omitted language: `speech-token-resume-1c9a6cd2-e595-4e1d-bf03-5ad673786b48/evidence.json`

This proves equivalence for a model reload and intentional exception on one source range. It does not prove process-kill recovery, arbitrary audio equivalence, speech accuracy, concurrent safety or a production checkpoint format.

## Language behavior discovered

The omitted-language experiment printed an English-default warning. Inspection of the installed `src/models/whisper/modeling_whisper.js`, `_retrieve_init_tokens`, confirmed that automatic language detection is unimplemented and missing language selects English. The production API now reports this fallback explicitly and supplies English to generation. Previous evidence described this as automatic-language execution; it only established omitted-option execution, not detection.

## Production implementation and qualification

`SpeechCheckpoints` and `SpeechAnalysis` now implement the requirements below, with `avid_speech_runs`, `avid_speech_run`, `avid_resume_speech` and `speech_resume` jobs. Real Windows worker cancellation/reconnect/resume reused two saved windows into a nine-window Sonoma [0,180) transcript. Every segment exactly matched uninterrupted transcription; source and parent checkpoints remained unchanged. Completed resume was rejected. Evidence: `.avid-mcp-analysis/speech-resume-955a0ae2-6e99-4cca-a7cc-9c9d5089ffcb/evidence.json`; script: `scripts/research/qualify-speech-resume.mjs`. Unit coverage rejects changed input/audio, malformed tokens, out-of-scope media, changed completed checkpoints/transcripts and missing completed windows, and verifies method restoration after failure. Broader media, concurrency and power-loss qualification remain open.

Implementation requirements retained for review:

Persist an exclusive, bounded, versioned run manifest before computation. Bind checkpoints to source and extracted-audio hashes, pinned runtime/model revisions, generation settings, ordered feature hashes and validated int64 tensor dimensions/token limits. Reuse only a contiguous verified prefix in a new run; retain the parent unchanged. Scope every read to currently authorized media. Publish final transcript identity/checksum only after source revalidation and verify it on completed status reads. Restore the generation method in a `finally` block and serialize each model instance. Reject incompatible runtime changes instead of silently replaying. Test cancellation with actual worker termination, reconnect, changed inputs, malformed checkpoints, output deletion and completed-run rejection. Expose discover/status/resume operations and integrate the existing job lifecycle. Preprocessing still reruns; token checkpoints alone do not resume extraction or feature computation.
