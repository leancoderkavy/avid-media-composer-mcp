# Non-speech transcription probes

`avid_speaker_analysis` now includes `speechPresence` for the selected machine/effective view. It reports the union of all spans over the analyzed PCM interval, covered/uncovered seconds and coverage fraction independently of pagination. Overlaps are counted once. `no_spans_in_analyzed_audio` describes missing model/review spans; it does not prove no speech. `verified` remains false. Existing source/audio checksum checks apply. Actual five-fixture MCP report checks passed in `speech-presence-b067aa02-ee7a-43b1-b2ea-509be29d629d`.

Reviewed and machine coverage remain separate. A regression removes every reviewed span and verifies zero effective coverage while the machine view still reports its original overlapping spans and union duration, even when paged one span at a time. The parent analysis and source remain unchanged. Thus an empty effective view may reflect an editor's corrections rather than a model's original decision.

Run `node scripts/research/qualify-nonspeech.mjs` after building with the cached multilingual Whisper tiny model and FFmpeg available. The harness generates eight seconds each of digital silence, a 440 Hz sine wave and seeded white noise, then invokes language detection and automatic transcription through real MCP. Source hashes are checked after processing.

Evidence: `.avid-mcp-analysis/nonspeech-cbd88a25-bd6a-4798-b377-8159b3986baa/evidence.json`. Model revision: `onnx-community/whisper-tiny` at `ff4177021cc41f7db950912b73ea4fdf7d01d8e7`.

| Input with no speech | Language candidate | Automatic transcription |
| --- | --- | --- |
| Digital silence | None | Rejected |
| 440 Hz tone | English, model probability 0.2470 | `Thank you.` |
| Seeded white noise | Norwegian Nynorsk, model probability 0.6604 | `Thank you for watching!` |

Both nonzero signals produced false speech text. These observations contradict broad non-speech rejection or ASR accuracy claims. Language-token probabilities are not calibrated speech-presence confidence; the larger noise probability did not indicate speech. Existing results correctly require review, but that flag does not solve the accuracy problem.

This is a three-input synthetic development probe, not a representative accuracy benchmark. Speech-presence detection, mixed speech/noise/music evaluation and any rejection threshold need independent positive and negative fixtures before changing automatic transcription. Do not add phrase-based suppression for these outputs: the same words may occur in real speech. The harness retains machine results without treating a successful invocation as an accuracy pass.

## Existing segmentation comparison

`qualify-speech-presence.mjs` accepts negative-probe evidence and positive-language evidence, then invokes the installed diarization model through MCP on each file. On the three negatives above it returned zero spans. Existing synthetic English and Mandarin speech fixtures returned two and three spans respectively. All file hashes remained unchanged. Evidence: `.avid-mcp-analysis/speech-presence-4abbe458-cff1-4534-ac39-1e179feefbfa/evidence.json`.

This suggests the existing segmentation model may help identify these ASR failures. It does not establish a calibrated voice-activity detector, per-word alignment or safe rejection of quiet/short/overlapping speech. Any optional gate must retain source-time evidence and distinguish unavailable segmentation from a verified no-span result. Ordinary transcription is unchanged; real music/noise and varied positive speech remain necessary acceptance inputs.

With `--stress`, the presence harness also generates speech reduced to 0.01 amplitude (-40 dB) and speech mixed with seeded white noise at amplitude 0.03. In `speech-presence-f1617092-3f28-41a0-8abe-b180b18b94f5`, English clean/quiet/noise-mixed variants each produced two spans; Mandarin variants each produced three. The three non-speech probes again produced zero. Original and analyzed file hashes were preserved.

These nine cases test whole-file speech presence only. Equal span counts do not prove identical boundaries or complete spoken-word coverage. The noise amplitude is a generation parameter, not a measured SNR. Actual recordings, short utterances, other noise/music types and overlapping voices remain unqualified; no production rejection threshold was changed.

## Reviewing suspect transcript text

The existing `avid_align_speakers` tool can compare a checksum-selected transcript revision with saved segmentation evidence. `qualify-nonspeech-review.mjs` imported the actual false tone/noise transcripts into an isolated library, generated segmentation, reconnected with inspection-only authority and aligned both revisions. Every returned segment had `no_speech_overlap`, zero speech seconds and no candidates. Transcript and source hashes stayed unchanged. Evidence: `nonspeech-review-13209188-fc62-4ed0-a5f8-53e530459f87`.

This provides a review signal using existing tools: inspect unexpected text where model speech spans are absent. It is not proof that those words are false in an arbitrary recording, since segmentation can miss real speech. Retain the text and review source audio before correcting a transcript; this workflow applies no automatic suppression.

Alignment pages include `totalTranscriptSegments`, `intersectingSegments` and `outsideAnalysisSegments` for the entire revision, independent of the cursor. The last count means wholly outside the analyzed range. Intersecting segments can still extend beyond it; inspect each segment's `outsideAnalysisSeconds`. Reaching the last page therefore does not imply the whole transcript was reviewed against segmentation.
