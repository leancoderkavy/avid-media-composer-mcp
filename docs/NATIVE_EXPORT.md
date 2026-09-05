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

Contracts may additionally require color declarations:

```json
"color": {"range":"tv","space":"bt709","transfer":"bt709","primaries":"bt709"}
```

Inside `expected`, `color.range` must be `tv` (limited) or `pc` (full). Space, transfer and primaries are optional exact ffprobe tag strings. Requested tags must be present and equal; the verifier does not infer them from the codec, raster, preset name or pixels. Omitting `color` preserves the earlier behavior. Successful receipts report `colorTagsChecked` and retain the full expected contract and probe metadata. A probe timeout at the observation deadline preserves an earlier mismatch diagnostic and attaches the timeout cause.

Matching tags is not color fidelity. The tested PCM-sequence export declares limited range but its pixel comparison supports full-range interpretation; the separately corrected research copy is not a general automatic remedy. Use the [render qualification evidence](NATIVE_RENDER_QUALIFICATION.md) when assessing that fixture. An explicit full-range requirement correctly refuses the uncorrected limited-tagged file, even though it otherwise decodes successfully.

Preview binds observable project, owner, saved-bin hash, clip metadata, preset names and output-root state. Apply consumes the token once, rechecks state, obtains the per-user native write lock, creates a unique output folder and records an attempt before dispatch. The lock remains held through stable-file observation, output-contract checks, full decode, decoded frame count and hash verification. A successful receipt contains `outputVerified: true` and `sourceFidelityVerified: false`.

After dispatch, an RPC or verification failure returns `NATIVE_EXPORT_UNCERTAIN` with the output path and retains `~/.avid-mcp/native-write.lock`. Inspect the recorded attempt, output and editor activity before considering recovery. The lock is never stolen based on elapsed time, and the export is never automatically repeated.

Use `avid_native_lock_status` to inspect an explicitly retained export lock within the current project/output scope. Close Avid, then pass the returned SHA-256 to `avid_recover_native_export_lock`. Recovery requires export capability, the qualified Windows binary, an unchanged lock and two stopped-process observations. It archives the inspected record before releasing the lock, preserving render output and never resubmitting the export. An archive marked `prepared-for-release` is not by itself proof of release; use the returned result or a fresh status read. Active/generic abandoned locks are excluded. Real running-host refusal and stopped-host release are qualified through MCP using isolated retained-lock fixtures against the installed host process state. The stopped test confirmed absent lock status, an archived record and unchanged output. Avid relaunch reached activation; project restart verification remains pending manual startup. Run scripts/research/qualify-lock-recovery.mjs with --expect-stopped only after closing Avid; its default mode requires a running host and tests refusal.

The API does not expose preset-content fingerprints or the complete unsaved timeline graph. Current guards therefore do not prove those remained unchanged. Output verification checks the declared technical contract, not exact source frames, color transforms, channel identity or perceptual sync. Native render evidence and remaining fidelity work are recorded in [render qualification](NATIVE_RENDER_QUALIFICATION.md).

Contracts may require `expected.videoStartTime` and each audio entry's `startTime`, in presentation seconds from -86400 through 86400. Requested starts must be present, numeric and within one microsecond of the expectation (ffprobe timestamp precision). Missing, null, empty or unknown declarations fail. Omitted fields preserve earlier behavior. These checks describe stream starts, not source cut identity, packet continuity or perceptual synchronization.

The research script `scripts/research/qualify-render-start-times.mjs` verifies zero starts on the checksum-selected Sonoma native render and generates a four-second fixture whose audio starts at 0.25 seconds. That fixture passes the legacy duration-only contract and the explicitly declared delay, but fails a zero-audio-start contract. Evidence: `.avid-mcp-analysis/render-start-times-864da221-7faf-4ee0-8cfb-8431d1d1b32e/evidence.json`; original native render unchanged.
