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
