# Non-speech transcription probes

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
