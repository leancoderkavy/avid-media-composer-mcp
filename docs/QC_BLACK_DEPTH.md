# Black detection across bit depth and range

`node scripts/research/qualify-qc-black-depth.mjs` generates four owned FFV1 fixtures: 8-bit/10-bit planar YUV 4:2:0, each with full and limited range. Four-second clips alternate one second of black and one second of white at 30 fps. Integer luma values are 0/255 and 16/235 for 8-bit, and 0/1023 and 64/940 for 10-bit. Independent raw decoding checks frame byte counts and luma at all four interval starts.

Actual MCP QC and saved-report retrieval passed eight cases on this Windows host:

| Requested source range | Expected black intervals | Decoded frames |
| --- | --- | --- |
| [0,4) | [0,1), [2,3) | 120 |
| [0.5,3.5) | [0.5,1), [2,3) | 90 |

Each case also verifies the reported pixel format and range declaration, exact persisted black intervals, and unchanged input SHA-256. Evidence: `.avid-mcp-analysis/qc-black-depth-270780c2-6df9-40ac-9760-f4ad5bccd412/evidence.json`. Syntax and actual execution passed. These are synthetic integer-luma fixtures, not Sonoma-derived or camera-mastered HDR footage.

The result qualifies these black/white intervals and nonzero source offsets at the default pixel threshold and a 0.5-second minimum. It does not qualify threshold boundaries, near-black quantization, HDR EOTFs or perceptual darkness, alpha, trailing-black end semantics, other codecs, or delivery-standard compliance. No production detection code changed.
