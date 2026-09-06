# Source-clock editing copies

`avid_prepare_source_clock_media` creates a separate MOV containing copied H.264 video and stereo 48 kHz, 24-bit PCM audio normalized to the source presentation clock. It uses `aresample=48000:async=1:first_pts=0`; normalization may insert or remove samples to follow timestamps. This is an explicit preparation operation, not an automatic repair or relink.

The [FFmpeg resampler documentation](https://ffmpeg.org/ffmpeg-resampler.html) specifies that `async=1` enables timestamp-based filling/trimming and `first_pts=0` permits padding/trimming at the stream start. A matching normalized-PCM hash proves this recipe was reproduced; it does not establish that the source timestamps themselves are editorially correct.

```json
{
  "options": {
    "file": "D:/Media/source.mp4",
    "expectedSha256": "<current source SHA-256>",
    "videoStream": 0,
    "audioStream": 1
  }
}
```

Stream indexes are absolute indexes from the source probe, not ordinal video/audio positions. The source must be an allowed local MP4/MOV, at most 4 GiB, with one explicitly selected H.264 video stream and one stereo audio stream. Selected streams need known nonnegative timestamps and at most 600 seconds of coverage; the video needs known frame count and geometry. Other media streams are omitted. A generated MOV timecode stream is accepted only if its declaration matches the selected source video's timecode.

The tool requires `export`, a configured output root and local FFmpeg/ffprobe. Each subprocess uses the configured command timeout. It writes a unique `avid-mcp-library/source-clock-<UUID>/prepared.mov` and an attempt record, never an existing source or Avid project. Caught failures retain outputs and a failure record when that record can be written. Abrupt process exit can leave an attempt or output with neither a failure nor a success receipt. Missing failure evidence does not establish success or worker termination. There is no automatic retry.

## Interrupted preparation and explicit retry

`avid_source_clock_status` accepts `{ "runId": "<UUID from source-clock-UUID>" }` with inspection authority. It reads bounded local records, validates source scope/checksum and record identity, and checks the output checksum when a success receipt exists. Results distinguish `unresolved`, `failure_recorded` and `receipt_matches_files`. Conflicting outcome records, changed files and mismatched identities are rejected. Receipt matching is not a new essence verification or proof of receipt authenticity. `workerState` always remains `unknown`; this read cannot authorize cleanup or prove termination. Failure message text and unvalidated probe payloads are not returned.

Actual MCP inspection of both interrupted attempts returned `unresolved`; inspection of both newly prepared outputs returned `receipt_matches_files` with the correct output hash. Source and interrupted artifacts stayed unchanged. Evidence: `.avid-mcp-analysis/source-clock-crash-a9172092-6b09-4a87-9279-9c24a2393050/evidence.json`. Ten focused preparation tests and build passed, including changed output/source, conflicting records, mismatched identity, unauthorized source and no subprocess invocation during status reads. Automatic run discovery remains open.

`qualify-source-clock-crash.mjs` exercised actual production preparation on an owned two-second H.264/stereo-AAC fixture. Instrumented filesystem barriers paused the worker after the completed attempt write and immediately before the success-receipt write, respectively. In each case the harness killed its exact child and awaited confirmed process closure. Neither case left a success or failure receipt; the first retained only the attempt, while the second retained the attempt and generated MOV.

A new MCP server then repeated the original checksum-selected preparation request. Both retries recomputed and verified a new MOV in a distinct directory; persisted receipts matched returned payloads and output hashes. Source and interrupted-directory hashes stayed unchanged. Evidence: `.avid-mcp-analysis/source-clock-crash-e7d2f0fe-991d-4a7f-9886-fbdc6ab969b2/evidence.json`. Script syntax and real execution passed; no production code changed.

This qualifies explicit fresh retry at those two boundaries, with no subprocess active at either barrier. It does not qualify termination during FFmpeg, orphan containment, discovery/status tools, automatic cleanup, interrupted receipt writes or power-loss durability. Do not treat a retained `prepared.mov` as verified solely because it exists, even if an interrupted run had finished computing it.

FFmpeg receives a 4 GiB muxer output-size limit during conversion. This limit can overshoot slightly and can stop encoding with exit code zero, so it is not completion evidence or an exact filesystem quota. The tool also rejects oversized final files and incomplete frame/essence/PCM comparisons. `scripts/research/qualify-preparation-size-limit.mjs` demonstrated this with a 1 MiB test cap: FFmpeg returned zero with 1,077,432 bytes and only 69 of 5,725 video frames. The truncated research artifact is retained under `.avid-mcp-analysis/preparation-size-limit-2f46ebda-6d57-42c4-937e-466da4726036/`; it is not a verified preparation.

Before reporting success, it verifies copied compressed-video essence, frame count/geometry/timing/color declarations, exact normalized PCM, zero-origin contiguous audio packets, source integrity and output integrity. The receipt identifies selected streams, hashes, probes and continuity measurements. These checks do not prove color appearance, perceptual synchronization or Avid import/render behavior. For editing, inspect the prepared file, link it through the native workflow, export its reference AAF, author explicit stereo selects, then independently verify saved source ranges and rendered channels.

## Sonoma evidence

Preparation also compares every selected video packet's presentation timestamp, decode timestamp and duration before and after conversion. Counts must match the declared frame count (at most 100,000); missing/nonfinite timestamps and nonpositive durations are unsupported. Negative decode timestamps and reordered presentation timestamps are preserved. Comparison allows 1.1 microseconds for ffprobe's six-decimal time formatting. The receipt includes `videoClock`; this verifies container timing, not decoded visual fidelity.

The seven-file matrix rerun at `.avid-mcp-analysis/source-clock-matrix-4e14318f-f114-4167-93b4-cd4f7c072f1e/evidence.json` passed with zero measured packet-clock differences for all seven files, together with the existing essence, PCM and source-preservation checks. Regression tests reject an interior timestamp mutation even when frame count and compressed essence match. Full check passed with 338 TypeScript and 22 Python tests, both transports, 126 tools and fresh package installation; log `.avid-mcp-analysis/check-video-packet-clock.log`.

`node scripts/research/qualify-source-clock-matrix.mjs` additionally exercises all seven local Sonoma MP4s serially through shipped stdio MCP. The completed run at `.avid-mcp-analysis/source-clock-matrix-12cf27ec-9e9e-4b5e-bdd5-a8e98acc277c/evidence.json` passed all seven preparations with original hashes unchanged, complete copied-video and normalized-PCM agreement, contiguous zero-origin audio, and independently rechecked output hashes. Outputs and receipts are retained separately from source media.

Coverage includes five 1280x720 and two 3840x2160 files, the 2.68-GB 4K anime export, video starts of 0, 0.021354 and 0.033333 seconds, and both `30/1` and `92037120/3067913` average frame rates. Frame counts range from 5,725 to 6,840. This broadens preparation evidence within this related H.264/stereo-AAC collection; it does not establish unrelated codec, HDR, multilingual content, native import/render, or fractional-rate AAF support. Native acceptance below still applies only to the separately qualified preview fixture.

`node scripts/research/qualify-source-clock-mcp.mjs` exercises the shipped tool through real stdio MCP. It rejects a wrong source checksum, prepares the original Sonoma MP4, checks the new output hash and confirms the original remains unchanged.

Evidence: `.avid-mcp-analysis/source-clock-mcp-166f5c69-55f8-41ea-8c91-5d349e9a34c1/evidence.json`. Copied video essence (`eb1e856639889b6c99b942316d15284dbbbbdeea94198cd9a3ae39f4dc940b3a`) and source-clock PCM (`b28d287137fcf855971513f761eafc6d57834e3b6415c9eabd12a6b07c0961f2`) match the earlier research preparation. The complete new MOV also has the identical SHA-256 `f46de96396ec30be8d41ff3c2f7d8aaf08ba190cdb2295e863ce535e7965bbeb`. The preparation receipt's `hostImportVerified` remains false because that operation does not call Avid.

The subsequent real MCP command `node scripts/research/qualify-aaf-workflow-mcp.mjs --canonical-tracks --stereo --prepared-media` linked this new output path in a disposable bin, saved/reopened the master, exported a source-bound reference, built explicit stereo cuts at frames 2850/3300 for 60 frames each, imported into `MCP_Workflow_8bd26857.avb`, saved/reopened, checked all six source references and rendered 120 frames. Evidence: `.avid-mcp-analysis/aaf-workflow-mcp-b53e7873-8af9-4f43-9b86-c7e2039c0d6f/evidence.json`. The reference's locator resolves to the newly prepared file; selected preserved files stayed unchanged and all token replays were refused.

The independent audio report `native-export-69f2def4-78ed-4191-8e93-67aba9b95014/export/audio-comparison-baa622db-1e15-47d6-8ff0-b11e84115a95/evidence.json` beneath that directory confirms exact complete source-clock 24-bit PCM agreement with distinct output channels. This qualifies the prepared-path native workflow for this Windows 2024.12 Sonoma fixture. General color, additional media/rates/builds, relink and undo acceptance remain open.

The corresponding frame report (`frame-comparison-acf72933-49c9-41c7-a220-75901a1115e6/evidence.json` beside the audio report) matches all 120 source presentation times within 0.334 microseconds and reproduces the earlier decoded-frame checksum `f2febfe806558dfc4f118a07d1b73b24b4e539698d89df69eff5e3136be964c6`. The known range-declaration/color error persists; matching the earlier render is not color acceptance.

## Fractional-rate preparation evidence

On 2026-09-06, `node scripts/research/qualify-source-clock-rates.mjs` generated owned two-second derivatives of the checksum-pinned Sonoma preview at 24000/1001, 25 and 30000/1001 fps. Each passed the actual stdio preparation tool's video essence, per-packet timestamp and source-clock PCM checks. Independent output decoding counted 48, 50 and 60 frames respectively, matching metadata; reported rates were preserved. Original and derivative source hashes were unchanged, and output hashes matched receipts. Evidence: `.avid-mcp-analysis/source-clock-rates-04d3b77a-2741-4124-af09-cac883927dcd/evidence.json`.

This qualifies short-file preparation at those rates. It does not convert video rates, qualify native Avid imports at those rates, authorize mixed-rate AAF cuts, or establish color/perceptual synchronization and long-media behavior. The AAF selects builder continues to require selected source slots to match the composition rate.
