# Native MP4 export

The development branch exposes `export_mp4` through `avid_native_preview` and `avid_native_apply`. It requires `inspect,export`, a configured output root, a running qualified Windows 2024.12 host and allowed project roots. Current video qualification is H.264, 1920x1080, 30 fps. Mac remains unqualified.

Read `avid_native_read` with query `export_settings` to discover preset names, and query the target bin/clip for its actual MOB ID. Configure the desired MP4 preset in Avid before previewing. Supply an explicit output contract, including every expected audio stream in order. The contract must cover the complete source duration; Use Marks and selected-track settings that change that contract will fail verification.

Example operation for a four-second composition and the locally created test preset:

```json
{
  "action": "export_mp4",
  "bin": "MCP_AAF_Selects_20260905.avb",
  "mobId": "<MOB ID returned by the host>",
  "preset": "MCP_H264_Qualification",
  "expected": {
    "videoCodec": "h264",
    "width": 1920,
    "height": 1080,
    "frames": 120,
    "rate": {"num": 30, "den": 1},
    "audio": [{"codec": "pcm_s24le", "channels": 1, "sampleRate": 48000}]
  }
}
```

That test preset downmixes stereo to mono and has unresolved color-level differences. Its contract describes the observed output; it is not a recommended delivery preset or a fidelity guarantee.

Preview binds observable project, owner, saved-bin hash, clip metadata, preset names and output-root state. Apply consumes the token once, rechecks state, obtains the per-user native write lock, creates a unique output folder and records an attempt before dispatch. The lock remains held through stable-file observation, output-contract checks, full decode, decoded frame count and hash verification. A successful receipt contains `outputVerified: true` and `sourceFidelityVerified: false`.

After dispatch, an RPC or verification failure returns `NATIVE_EXPORT_UNCERTAIN` with the output path and retains `~/.avid-mcp/native-write.lock`. Inspect the recorded attempt, output and editor activity before considering recovery. The lock is never stolen based on elapsed time, and the export is never automatically repeated. A supported recovery command is not yet implemented; do not blindly delete the lock or replay the action.

The API does not expose preset-content fingerprints or the complete unsaved timeline graph. Current guards therefore do not prove those remained unchanged. Output verification checks the declared technical contract, not exact source frames, color transforms, channel identity or perceptual sync. Native render evidence and remaining fidelity work are recorded in [render qualification](NATIVE_RENDER_QUALIFICATION.md).
