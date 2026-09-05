# Avid sequence render qualification

On Windows Media Composer Ultimate 2024.12, computer use exported the imported four-second `MCP_Sonoma_AAF_Selects` composition from the disposable `MCP_Sonoma_30p_20260905` project. This extends the saved-bin evidence in [native AAF qualification](NATIVE_AAF_QUALIFICATION.md). It does not qualify a shipped native export adapter.

## Observed procedure

With the sequence selected, File > Output > Export to File opened Export As. Options > Export As > MP4 opened UME File Export. A separate `MCP_H264_Qualification` preset was saved using Save As, with H.264, 1920x1080, 30p, Rec.709 and 8-bit output. Use Marks was off; Use Selected Tracks and Include Inactive Audio Tracks were on. The observed video-level option was Scale from Legal to Full Range. Audio remained at the preset's default settings.

The export went into a new local folder:

`.avid-mcp-analysis/host-render-3d588f93-c70a-408e-b5f0-b615007031e5/MCP_Sonoma_AAF_Selects.mp4`

## Independent result inspection

- File size: 10,851,478 bytes.
- H.264 Main, 1920x1080 progressive, 30/1 fps, 120 video frames, four seconds.
- Full-range BT.709 video tags; timecode 01:00:00:00.
- One mono PCM 24-bit, 48 kHz audio stream, four seconds.
- Extracted video frames at output seconds 0.5 and 2.5 show the expected golf cart and cellar corridor scenes from source ranges starting at seconds 95 and 110.
- Source MP4 SHA-256 remained `3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca`.

The Avid viewer capture remained black before and after export, while the exported frames contained video. Therefore black screen capture alone is not evidence of black output or missing media. The cause of the viewer capture issue is not established.

## Fidelity still open

The source is full-range BT.709 with stereo audio. This test's output is mono, so it does not prove channel preservation. The preset's level conversion also produced a visibly darker output. Comparison of resized JPEG samples against nominal source times yielded SSIM 0.855983 and 0.737515; these comparisons are diagnostic only and do not establish exact frame alignment or color conformance.

Next qualification must explicitly set and verify audio routing and color management, compare decoded output against source frame ranges, inspect cut boundaries, and repeat export through a guarded native adapter. Visible playback, perceptual audio sync, relink and undo/recovery remain open. Preserve this first render as evidence of the default-preset behavior.

## Native API export follow-up

`scripts/research/qualify-native-render-export.py` exported the same owned composition with the same named preset through native `ExportFile`. The probe checks the exact installed binary hash, listener owner, project, composition name and preset before dispatch. Its RPC allowlist contains only the reads needed for this fixture and ExportFile; it is not a general MCP export tool.

The first call returned Completed before the expected MP4 appeared. Inspecting the same output directory afterward found a complete 10,851,478-byte MP4 without resubmitting. Therefore adapters must distinguish RPC completion from output readiness. The revised probe waits up to 60 seconds for stable size/mtime over observations plus the expected 120-frame, 30 fps, four-second video metadata. A timeout remains unproven output and explicitly does not trigger another export.

The first native export's decoded video and audio frame checksum listing exactly matched the UI export's listing (SHA-256 of both framemd5 files: `a63612d156777e875af15247f40f3de669fb72fb01b9234fef835680d967e4e1`). MP4 file hashes differed, as expected for independently created containers. This proves equivalence to the tested preset, including its mono/color limitations; it does not resolve those limitations.

Retained evidence:

- `.avid-mcp-analysis/native-render-73fd6217-3fe5-4475-84e3-bbc5e1e1fae7/`: first RPC receipt, output, independent decode inspection and matching native/UI framemd5 files.
- `.avid-mcp-analysis/native-render-c64713a0-f2b7-4c98-8b80-977fa4a0258f/`: second isolated export validating the revised output-readiness probe, followed by independent full decoding.

Production work still needs preview/apply state guards, host serialization through output readiness, explicit preset contracts, cancellation/error handling and broader source/sequence qualification.
