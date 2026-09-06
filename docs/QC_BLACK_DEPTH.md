# Black detection across bit depth and range

## Open black detection at processing end

QC now records `findings.blackOpenAtProcessingEnd` from blackdetect start/end metadata, independently of its duration-qualified interval log. An unmatched start returns its source-clock start, `end: null` and `minimumDurationVerified: false`. It may be shorter than blackSeconds. It indicates no closing transition was observed before processing ended; it does not infer the media or requested-range endpoint. Closed detector intervals retain their existing timestamps. Older reports without this field have no recorded open-tail observation.

The real tail fixture is black from second 2 onward. Previously a requested end of 2.5 returned no black interval; ends 2.75, 3 and 4 returned last-frame ends of 2.733, 2.967 and 3.967. With metadata capture, all four additionally report an open start at second 2, preserved through saved-report readback. Evidence: `.avid-mcp-analysis/qc-black-tail-5fdfc91f-e8a3-4f56-80fd-c2bfdf5ee6a9/evidence.json`; script: `qualify-qc-black-tail.mjs`. Eight prior depth/range cases also passed against this build (`qc-black-depth-757add90-b9ab-4784-8e7a-17639f41b09e`). Unit checks cover offsets and closed/reopened transitions; persisted reads reject an invented end, upgraded certainty, out-of-range starts and open detections without selected video.

`node scripts/research/qualify-qc-black-depth.mjs` generates four owned FFV1 fixtures: 8-bit/10-bit planar YUV 4:2:0, each with full and limited range. Four-second clips alternate one second of black and one second of white at 30 fps. Integer luma values are 0/255 and 16/235 for 8-bit, and 0/1023 and 64/940 for 10-bit. Independent raw decoding checks frame byte counts and luma at all four interval starts.

Actual MCP QC and saved-report retrieval passed eight cases on this Windows host:

| Requested source range | Expected black intervals | Decoded frames |
| --- | --- | --- |
| [0,4) | [0,1), [2,3) | 120 |
| [0.5,3.5) | [0.5,1), [2,3) | 90 |

Each case also verifies the reported pixel format and range declaration, exact persisted black intervals, and unchanged input SHA-256. Evidence: `.avid-mcp-analysis/qc-black-depth-270780c2-6df9-40ac-9760-f4ad5bccd412/evidence.json`. Syntax and actual execution passed. These are synthetic integer-luma fixtures, not Sonoma-derived or camera-mastered HDR footage.

The result qualifies these black/white intervals and nonzero source offsets at the default pixel threshold and a 0.5-second minimum. It does not qualify threshold boundaries, near-black quantization, HDR EOTFs or perceptual darkness, alpha, trailing-black end semantics, other codecs, or delivery-standard compliance. No production detection code changed.
