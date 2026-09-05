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

The tool requires `export`, a configured output root and local FFmpeg/ffprobe. Each subprocess uses the configured command timeout. It writes a unique `avid-mcp-library/source-clock-<UUID>/prepared.mov` and an attempt record, never an existing source or Avid project. Failed outputs and their failure record remain available for inspection; there is no automatic retry or success receipt after failure.

Before reporting success, it verifies copied compressed-video essence, frame count/geometry/timing/color declarations, exact normalized PCM, zero-origin contiguous audio packets, source integrity and output integrity. The receipt identifies selected streams, hashes, probes and continuity measurements. These checks do not prove color appearance, perceptual synchronization or Avid import/render behavior. For editing, inspect the prepared file, link it through the native workflow, export its reference AAF, author explicit stereo selects, then independently verify saved source ranges and rendered channels.

## Sonoma evidence

`node scripts/research/qualify-source-clock-mcp.mjs` exercises the shipped tool through real stdio MCP. It rejects a wrong source checksum, prepares the original Sonoma MP4, checks the new output hash and confirms the original remains unchanged.

Evidence: `.avid-mcp-analysis/source-clock-mcp-166f5c69-55f8-41ea-8c91-5d349e9a34c1/evidence.json`. Copied video essence (`eb1e856639889b6c99b942316d15284dbbbbdeea94198cd9a3ae39f4dc940b3a`) and source-clock PCM (`b28d287137fcf855971513f761eafc6d57834e3b6415c9eabd12a6b07c0961f2`) match the earlier research preparation. The complete new MOV also has the identical SHA-256 `f46de96396ec30be8d41ff3c2f7d8aaf08ba190cdb2295e863ce535e7965bbeb`. The preparation receipt's `hostImportVerified` remains false because that operation does not call Avid.

The subsequent real MCP command `node scripts/research/qualify-aaf-workflow-mcp.mjs --canonical-tracks --stereo --prepared-media` linked this new output path in a disposable bin, saved/reopened the master, exported a source-bound reference, built explicit stereo cuts at frames 2850/3300 for 60 frames each, imported into `MCP_Workflow_8bd26857.avb`, saved/reopened, checked all six source references and rendered 120 frames. Evidence: `.avid-mcp-analysis/aaf-workflow-mcp-b53e7873-8af9-4f43-9b86-c7e2039c0d6f/evidence.json`. The reference's locator resolves to the newly prepared file; selected preserved files stayed unchanged and all token replays were refused.

The independent audio report `native-export-69f2def4-78ed-4191-8e93-67aba9b95014/export/audio-comparison-baa622db-1e15-47d6-8ff0-b11e84115a95/evidence.json` beneath that directory confirms exact complete source-clock 24-bit PCM agreement with distinct output channels. This qualifies the prepared-path native workflow for this Windows 2024.12 Sonoma fixture. General color, additional media/rates/builds, relink and undo acceptance remain open.

The corresponding frame report (`frame-comparison-acf72933-49c9-41c7-a220-75901a1115e6/evidence.json` beside the audio report) matches all 120 source presentation times within 0.334 microseconds and reproduces the earlier decoded-frame checksum `f2febfe806558dfc4f118a07d1b73b24b4e539698d89df69eff5e3136be964c6`. The known range-declaration/color error persists; matching the earlier render is not color acceptance.
