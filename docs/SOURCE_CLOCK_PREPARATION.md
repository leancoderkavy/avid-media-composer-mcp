# Source-clock editing copies

`avid_prepare_source_clock_media` creates a separate MOV containing copied H.264 video and stereo 48 kHz, 24-bit PCM audio normalized to the source presentation clock. It uses `aresample=48000:async=1:first_pts=0`; normalization may insert or remove samples to follow timestamps. This is an explicit preparation operation, not an automatic repair or relink.

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

Evidence: `.avid-mcp-analysis/source-clock-mcp-166f5c69-55f8-41ea-8c91-5d349e9a34c1/evidence.json`. Copied video essence (`eb1e856639889b6c99b942316d15284dbbbbdeea94198cd9a3ae39f4dc940b3a`) and source-clock PCM (`b28d287137fcf855971513f761eafc6d57834e3b6415c9eabd12a6b07c0961f2`) match the earlier research preparation. The complete new MOV also has the identical SHA-256 `f46de96396ec30be8d41ff3c2f7d8aaf08ba190cdb2295e863ce535e7965bbeb`. The earlier asset has native stereo-render evidence; this newly generated path has not yet been linked or rendered in Avid. Its `hostImportVerified` remains false.
