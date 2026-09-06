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

The omitted-language experiment printed an English-default warning. Inspection of the installed `src/models/whisper/modeling_whisper.js`, `_retrieve_init_tokens`, confirmed that automatic language detection is unimplemented and missing language selects English. Recipe-one production runs reported this fallback explicitly and supplied English to generation. New recipe-two multilingual auto runs use a separate decoder-step ranking before transcription, described below. Previous evidence described this as automatic-language execution; it only established omitted-option execution, not detection.

## Production implementation and qualification

`SpeechCheckpoints` and `SpeechAnalysis` now implement the requirements below, with `avid_speech_runs`, `avid_speech_run`, `avid_resume_speech` and `speech_resume` jobs. Real Windows worker cancellation/reconnect/resume reused two saved windows into a nine-window Sonoma [0,180) transcript. Every segment exactly matched uninterrupted transcription; source and parent checkpoints remained unchanged. Completed resume was rejected. Evidence: `.avid-mcp-analysis/speech-resume-955a0ae2-6e99-4cca-a7cc-9c9d5089ffcb/evidence.json`; script: `scripts/research/qualify-speech-resume.mjs`. Unit coverage rejects changed input/audio, malformed tokens, out-of-scope media, changed completed checkpoints/transcripts and missing completed windows, and verifies method restoration after failure. Broader media, concurrency and power-loss qualification remain open.

Implementation requirements retained for review:

Persist an exclusive, bounded, versioned run manifest before computation. Bind checkpoints to source and extracted-audio hashes, pinned runtime/model revisions, generation settings, ordered feature hashes and validated int64 tensor dimensions/token limits. Reuse only a contiguous verified prefix in a new run; retain the parent unchanged. Scope every read to currently authorized media. Publish final transcript identity/checksum only after source revalidation and verify it on completed status reads. Restore the generation method in a `finally` block and serialize each model instance. Reject incompatible runtime changes instead of silently replaying. Test cancellation with actual worker termination, reconnect, changed inputs, malformed checkpoints, output deletion and completed-run rejection. Expose discover/status/resume operations and integrate the existing job lifecycle. Preprocessing still reruns; token checkpoints alone do not resume extraction or feature computation.

## Multilingual automatic selection and recipe two

New multilingual auto requests run the existing language-token ranking on the first 30 seconds (or shorter extracted audio) and explicitly pass its leading candidate to transcription. Exact digital silence returns `SPEECH_LANGUAGE_UNDETERMINED`. The decision and five ranked scores are saved before transcript generation in recipe-two manifests, reused on resume, and included in the completed manifest checksum. Model scores are not calibrated confidence; this is one language for the entire requested range, not mixed-language segmentation. Detection itself and preprocessing are not checkpointed. English-only defaults remain unchanged. That implementation allowed recipe-one multilingual auto resumes to preserve English fallback in a recipe-two child. Recipe three below supersedes this resume compatibility.

Actual MCP on known English/Mandarin synthetic voices selected the expected language and reproduced explicit-language segments exactly; digital silence was rejected. Evidence: `.avid-mcp-analysis/speech-auto-bf46421f-6ac6-4b22-9a03-44f6158f60fc/evidence.json`. Actual Sonoma cancellation/reconnect retained its saved language decision and reused one window into nine, matching uninterrupted output and preserving parent/source: `.avid-mcp-analysis/speech-resume-438a889c-97f9-42d1-b9a5-724cd2146d4e/evidence.json`. Run `qualify-speech-resume.mjs --multilingual-auto` for this variant. These tests establish selection and recovery behavior, not broad language accuracy, transcription accuracy or diarization.


## Source-clock audio extraction and recipe three

New transcription runs use recipe three. Transcription and language detection select the first audio stream, decode from the media origin through the requested end, compensate timestamps with `aresample=16000:async=1:first_pts=0`, then trim to the requested source range and subtract its start. This preserves leading audio delay and fills timestamp gaps instead of concatenating decoded packets. Output is bounded to the requested number of 16 kHz mono float samples. Late ranges decode preceding media and remain subject to the configured process timeout.

Recipe-one/two runs and completed transcripts remain readable. Resuming those runs is refused with an explicit instruction to start a new transcription; files are retained. New status responses expose recipe and resumable fields. Recipe-three resumes retain the language decision, verify PCM and feature hashes, and checksum completed manifests as before. This prevents mixing old token checkpoints with corrected timing, even when a particular source happens to decode identically.

Real FFmpeg qualification used an original delayed-tone fixture, a one-second packet timestamp gap, and Sonoma. Delay remained aligned for ranges beginning before and after the tone. The gap remained silent between audible intervals. Sonoma full extraction measured 190.8666875 seconds; [0,60), [60,90), and [160,190) measured exactly their requested lengths, and interior samples matched the corresponding full-decode slices exactly (100 ms excluded at either boundary). Source hashes remained unchanged. Evidence: `.avid-mcp-analysis/speech-clock-17a3e7ba-4cc5-479f-8049-1588c029df01/evidence.json`; reproduce with `AVID_MCP_FFMPEG` set and `node scripts/research/qualify-speech-clock.mjs <preview.mp4>` after building.

Actual multilingual-auto MCP cancellation/reconnect/resume reused two windows into nine and exactly matched uninterrupted output while preserving source and parent checkpoints: `.avid-mcp-analysis/speech-resume-32036e5b-65be-4be4-b9e1-8d0341ba6909/evidence.json`. Full local check passed: 247 TypeScript tests, nine Python tests, both transports and a fresh tarball install/audit. This establishes extraction clock and recovery behavior on these fixtures, not recognition accuracy, all container timestamp conventions, or speaker alignment quality.
