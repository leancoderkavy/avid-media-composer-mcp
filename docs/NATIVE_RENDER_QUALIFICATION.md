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
