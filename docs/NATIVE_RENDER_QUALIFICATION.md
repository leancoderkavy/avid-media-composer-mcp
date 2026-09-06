# Avid sequence render qualification

## Combined prepared-PCM and color-refresh export, 2026-09-06

Created `MCP_Color_ac0a950e18ee.avb` with `MCP_PCM_AAF_Selects.Copy.01` and verified saved baseline sequence semantics against the current PCM sequence. Its source bin had changed since the historical import hash; fresh parsing confirmed the same 120-frame/30 fps picture and stereo input ranges before selecting the current hash `0ac72b899c37b45618d2924f5814b3e411e077a04ad4a3b79d427b7099fee81f`. The first old-hash attempt refused before mutation. UI Refresh Sequence > Color Adapters was applied to the selected copy, then only its bin was closed/reopened before native export with the stereo/legal preset.

The combined export SHA-256 is `ee3ab16d6e7789a1a06727fabb6fbafc41207fa31b352791e2dec0908b484e0d`. Technical verification decoded all 120 frames. Independent 24-bit PCM hashing exactly matched the original source-clock cuts, with distinct left/right channels and zero best lag for corresponding channels. Full-raster mean SSIM was 0.958711 (minimum 0.901226, RGB RMSE 4.429720); all 120 best source-frame matches aligned to intended presentation times within 0.334 microseconds. No stream retagging was performed.

`verify-pcm-color-evidence.mjs` binds the media checks to the native receipt, confirms unchanged non-picture tracks and picture input identities/ranges, and rechecks the original PCM sequence bin, original MP4, prepared MOV and saved candidate hashes. Evidence: `.avid-mcp-analysis/native-color-fixture-3bfb1d55-f1d4-4675-936c-bd2ab3cf8694/combined-evidence.json`; full-raster comparison: `.avid-mcp-analysis/full-resolution-9a2302fe-441f-49db-adf7-753e9091bfad/evidence.json`. This combines exact audio preservation and improved color in one fixture. Color residual, perceptual acceptance, other media/hosts and general native refresh automation remain open.

The new source creates an automatic-conversion XML wrapper (`automaticConversion="true"`, list name `From Rec.709 [full range] to Rec.709`) around the same linear LUT. Saved inspection now recognizes that observed bounded form and retains both declarations; unknown wrappers still remain unparsed. Actual MCP capture/reconnect and input tracing passed on this prepared-PCM fixture (`saved-color-effects-c73b53bc-9a3f-44e2-a5f9-79f4d759dacb` under `.avid-mcp-analysis`). This metadata does not establish the meaning of the Inverted flag or applied color math.

## Refreshed AAC-sequence frame/audio comparison, 2026-09-06

Independent diagnostics on the color-refreshed Copy.05 render found all 120 best frame matches at decoded source index one below nominal 30 fps indexing, matching the original source's 0.033333-second video start. Maximum presentation-time residual was 0.334 microseconds; mean best-match RGB RMSE was 2.206064 at 96x54. This agrees with the earlier full-resolution color improvement, but correlation ranking does not certify exact frame identity. Evidence: the refreshed export's `frame-comparison-018799ce-e59b-43df-930c-1d4967639fa0/evidence.json`.

The same render still fails audio preservation: its two PCM channels are identical and the source-clock PCM hash differs, with poor bounded-lag correlation. Evidence: `audio-comparison-372cae73-d0b0-40fc-8ff2-5868ef6e0bfb/evidence.json` beside that render. Source and output hashes remained unchanged. Color refresh did not repair the older AAC-linked sequence's known audio issue. The next combined experiment uses an isolated copy of the prepared-PCM sequence, whose earlier audio renders matched exactly, then applies the same color refresh and independently verifies both video and audio.

## Isolated color-adapter refresh result, 2026-09-06

The retained CFUserParam payload is 243 bytes (SHA-256 `f94ba338bf5b7a57caed1a57d9b05730d830ecdd3ae55a38b2c840d18045c7d5`). Its UTF-8 XML declares a single LinearLut named `Levels scaling (full range to video levels)`, bit depth 10, black 64, white 940 and an empty `Inverted` element. Both wrappers have identical parameter declarations. This confirms saved range-scaling metadata agrees with the observed UI label; the direction/meaning of the Inverted flag and actual color math are not inferred.

Saved effect inspection recognizes that bounded single-LinearLut payload under the observed parameter/value UUIDs and returns `linearLutDeclaration`. Unknown formats, disabled or duplicate parameters, control tracks, oversized payloads, XML declarations/DTDs/entities, and invalid levels are not interpreted. It preserves opacity and exposes the flag as `invertedFlagPresent`, not an instruction to invert a transform. `inspect-color-parameters.py` records bounded parameter/keyframe declarations while hashing opaque bytes and preserving the source bin.

Saved-object inspection now identifies both new picture wrappers as `EFF2_LUTSFX`, each with PRLS parameters, FXPS keyframes and one nested 60-frame picture sequence. Their source IDs, source track 1 and starts 2850/3300 match the original direct clips; both audio tracks remain structurally unchanged in the recorded projection. `scripts/research/inspect-color-adapter-graph.py` retains the before/after declarations in `adapter-structure.json` alongside the fixture. Parameter and keyframe meanings are not decoded, so this does not qualify transparent traversal or effect equivalence.

The production saved-bin parser now exposes bounded `effect.id`, `hasParameters` and `hasKeyframes` on opaque TKFX nodes. Saved snapshots preserve these declarations through reconnect and range queries. It does not flatten the effect, invent a source range or mark the bin complete. Actual MCP capture/reconnect of the refreshed saved bin returned both `EFF2_LUTSFX` declarations and preserved its hash: `.avid-mcp-analysis/saved-color-effects-8ceef0b0-72dd-4153-bb1b-70988919439f/evidence.json`.

Created `MCP_Color_ca6d9cb31bcc.avb` with a copy of the owned Copy.05 sequence and verified saved sequence semantics before refresh, excluding its new name/identity. UI Refresh Sequence > Color Adapters was applied to the selected copy. Native close/open persisted that bin; the saved picture nodes changed to opaque TKFX wrappers. This is evidence of an adapter-related structure change, not full effect/source-graph interpretation.

Export using `MCP_H264_Stereo_Legal_20260905` passed technical verification including all 120 decoded frames, legal-range BT.709 declarations and stereo 48 kHz PCM. Output SHA-256: `d182cfbf8be15552dbe4e426c175c2b15f5bf9226f94b8da923d04e61bca2d19`. Independent full-resolution comparison using the existing source-frame alignment and Lanczos reference yielded mean SSIM 0.958711, minimum 0.901226, RGB RMSE 4.429720 and aggregate PSNR 35.203279 dB. The preceding unrefreshed native render had mean SSIM 0.784061. No output range retagging was applied in this experiment.

Original Copy.05 saved-bin and MP4 hashes remained at their baselines. Evidence is retained in `.avid-mcp-analysis/native-color-fixture-dccc9bf2-5f8a-46ff-9768-3ec701e901e0` and `.avid-mcp-analysis/full-resolution-dc5135ec-151a-4eee-9fab-d7fdf6048cba/evidence.json`. This supports source color-adapter propagation as the next integration target. Scaling differences, broader presets/media, effect mapping, audio fidelity and general color conformance remain open. No production refresh action or automatic correction is claimed.

## Live source-color and export-preset inspection, 2026-09-06

Computer use inspected the currently loaded `MCP_Sonoma_AAF_Selects.Copy.05` in the Sonoma Windows project. Export As selected `MCP_H264_Stereo_Legal_20260905`. Its UME options showed Rec.709, **Keep as Legal Range**, H.264 8-bit, constant 20 Mbps, PCM stereo 48 kHz/24-bit, Use Marks off, Use Selected Tracks on and Include Inactive Audio Tracks on. The dialogs were canceled; no export or preset save was requested. A temporary Not Responding title during dismissal cleared on fresh observation.

Timeline Find Bin selected `Sonoma_Escape_RoughCut_v1_preview.Exported.02`. Its Source Settings > Color Encoding showed **Rec.709 [full range]**, a **Levels scaling (full range to video levels)** transformation, Generic adapter type and **Bypass all color transformations unchecked**. Source Settings was canceled without pressing Apply or OK. A bin-tab asterisk was visible afterward, so this inspection does not prove the absence of unsaved application-state changes. The saved Copy.05 bin still matched baseline SHA-256 `8b8ccefa6225a38acc6aae30be05d05b469c14b8758afc12bdd80494df785822`; original MP4 SHA-256 remained `3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca`. No save, revert or restart was performed.

These live observations weaken a simple missing-source-range-classification explanation. They do not prove that the imported composition actually applies the displayed source transformation. The next controlled test should duplicate the owned sequence into a new fixture, compare saved source/color-adapter structure, exercise the relevant Refresh Sequence source-settings operation only on that copy, and independently compare its native render. Do not ship automatic full-range retagging based on this observation; the discrepancy remains unresolved.

The development branch now includes a preview/apply export action; see [native export usage and limits](NATIVE_EXPORT.md). The sections below preserve the research steps leading to that implementation.

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

## Reusable output verification

`src/native/render-verifier.ts` now provides the readiness check used by the render inspection script. It checks output-root scope, stable size/mtime, declared video and audio stream contracts, complete decoding and actual decoded video frame count, then rechecks file identity and SHA-256. Callers can supply a host-owner assertion for checks during polling and after decoding. It does not issue any native RPC or retry an export.

Tests exercise delayed creation, missing files, contract mismatch, failed decoding, a short decode despite complete-looking metadata, host-owner changes and out-of-scope files. The retained second native render passed this verifier with all 120 frames decoded. The production native action still needs to connect preview/apply and lock lifetime to this verifier; this module alone does not qualify that action.

## MCP action qualification

The subsequent `scripts/research/qualify-native-render-mcp.mjs` run used real stdio MCP preview/apply with `inspect,export` authority. It generated a unique MP4, decoded all 120 frames against the explicit preset contract, wrote a receipt and rejected replay of the consumed token. Output SHA-256 was `0c7d81b052c56f47773bb1629ea5dc20d89e4f86a796e6afc42abcbf41a523ae`.

Evidence is retained in `.avid-mcp-analysis/native-render-mcp-faa6dcfa-c7eb-4a06-a4d7-e48c0786f998/`. Unit tests confirm the lock is held while output verification runs, retained after uncertainty and released after verified success. The complete source-duration contract is checked before dispatch. Technical output verification does not close the source-fidelity gaps above.

## Fresh export and complete frame comparison

A fresh actual MCP preview/apply export after the host availability refresh decoded all 120 frames and refused token replay. Evidence: `.avid-mcp-analysis/native-render-mcp-109ad870-3519-4218-ac27-8aa745392be7/`. Its container SHA-256 is `bdc014f5a3ecd573f11f25d4c04578e6d104770547485aad5dd8295c0453829f`. The complete decoded video/audio framemd5 listing still hashes to `a63612d156777e875af15247f40f3de669fb72fb01b9234fef835680d967e4e1`, identical to the earlier UI/native exports.

`scripts/research/compare-native-render-frames.mjs` compares every output frame with the nominal source index and three neighbors on either side. It uses 96x54 area-resampled RGB and Pearson correlation, retains every result, reads actual source frame presentation timestamps and rechecks source/render hashes. It only inspects existing files. The final run is retained under the fresh export's `native-export-b0214ccf-d56c-439b-b11a-e96725f5b10f/export/frame-comparison-1da62467-a52d-4edb-9c18-8c5ccf080f5b/evidence.json`.

All 120 best matches have decoded source index one less than the nominal 30 fps calculation, including output frames 59 and 60 across the cut. Their presentation timestamps match intended source times within 0.000000334 seconds. The source video starts at 0.033333 seconds: this evidence supports source-clock alignment rather than an off-by-one editing defect. Downsampling, compression and repeated imagery mean this ranking is still diagnostic, not exact frame conformance.

The export retains the same mono PCM stream versus the source's stereo AAC. RGB level differences persist. Color management, stereo routing and perceptual audio/video sync remain open; no preset was changed in this refresh. The earlier black-viewer observation is historical: a later refresh showed nonblack but unchanged captured imagery as the playhead moved, which does not establish visible playback fidelity.

## Stereo and legal-range preset experiment

Computer use subsequently saved a separate `MCP_H264_Stereo_Legal_20260905` preset, selecting **Keep as Legal Range** and **Stereo** in UME File Export. It retains H.264 1920x1080 30p, Rec.709, 8-bit, 20 Mbps constant bitrate and PCM 48 kHz/24-bit. Use Marks remained off, selected tracks/inactive audio inclusion remained on. The original qualification preset was not overwritten. The UI export dialog was canceled after saving the new preset; the actual export used guarded MCP preview/apply.

Run `node scripts/research/qualify-native-render-mcp.mjs --stereo-legal` only when a new export of the owned fixture is intended. The explicit contract requires one two-channel PCM stream. The actual export passed all 120 decoded frames and replay refusal. Container SHA-256: `d894f21b3016211e221c714c4b4ff848a0a73a057631dea8c90324972190628e`. Evidence root: `.avid-mcp-analysis/native-render-mcp-efb15996-6232-409c-8bec-0ff94bedb4c9/`.

All 120 best frame matches still support the intended source presentation times. Mean best-match RGB RMSE fell from 19.34 to 10.94 on the diagnostic 0–255 scale, and mean RGB shift changed from -14.36 to -8.43. This is an improvement, not color conformance. Frame evidence is under `native-export-a2d1c79c-6f74-46cb-9c46-a46de02c34a0/export/frame-comparison-cdeb9680-3675-488d-8a7a-0e30bbc061cf/evidence.json`.

The new `scripts/research/compare-native-render-audio.mjs` extracts source-clock PCM for [95,97) and [110,112), compares all four source/output channel pairs per cut, and searches a bounded ±100 ms lag. It rechecks both input hashes and retains PCM and numeric evidence. The final run is under the same export directory's `audio-comparison-c5e461a8-10b9-4383-bdf7-e14468338134/evidence.json`.

Although metadata reports stereo, both rendered channels are **sample-for-sample identical**, while the original source channels differ. Source/output correlation is poor both at zero lag and within the bounded search (best below 0.12). This contradicts stereo preservation and does not establish audio timing; reported best lags are not reliable sync corrections. The inspected Avid-exported AAF picture/audio descriptors point directly to the original MP4, with audio sampling rate 48000, not an intermediate media file. Next checks must isolate track mixing/Direct Out and investigate a wider source-clock versus decoded-sample timing range. No automatic gain, timing or timeline correction was applied.

## Wider audio-clock comparison and prepared source

`scripts/research/compare-native-audio-clocks.py` uses NumPy FFT normalized cross-correlation at every sample within ±2 seconds. It compares each complete two-second rendered cut with left, right and averaged source channels under two independently extracted clocks: presentation timestamps and continuous decoded samples. Its deterministic self-test checks known offsets at both search boundaries and inside the window, fitted gain/intercept, and refusal to make a timing claim for constant audio. It writes diagnostics only; no offsets or gains are applied.

On the stereo/legal-range export, the averaged channels yielded correlation above 0.999998 for both cuts, with fitted gain approximately 1.41426 (about +3 dB). The intended 95-second cut matched source presentation time 94.7026875; the 110-second cut matched 109.5866667. These are different offsets (-297.3125 ms and -413.3333 ms), so a single sequence slip is not supported. Both cuts instead matched the continuous decoded-sample clock at +1024 samples (+21.3333 ms). This strongly supports different handling of the MP4's audio timestamps in the tested native path, plus a dual-mono mix; it does not establish the internal Avid mechanism or perceptual sync. Evidence: the stereo export's `audio-clocks-4641e532-e6cd-4897-b9a1-e0e475ef24c1/evidence.json`.

`scripts/research/prepare-sonoma-source-clock.mjs` now creates a separate research MOV with copied compressed video and source-clock 48 kHz stereo 24-bit PCM. It verifies unchanged video stream metadata, identical compressed video essence hashes, exact PCM equality against the source-clock decode, contiguous audio packets (maximum timestamp-rounding gap 0.000001 seconds), and the unchanged original source hash. The new file is `.avid-mcp-analysis/sonoma-source-clock-857e680b-48a7-4dc9-a52e-478f864ef2b9/Sonoma_SourceClock_Stereo.mov`, with SHA-256 `f46de96396ec30be8d41ff3c2f7d8aaf08ba190cdb2295e863ce535e7965bbeb`; the adjacent `evidence.json` contains all probes and checksums.

This file has not yet been linked/imported or rendered in Avid. Next qualification should use a new disposable bin/master/sequence, preserve the existing fixture, test Direct Out or explicit channel panning, and compare the new render against the source presentation clock. The preparation step alone does not resolve native audio or color fidelity and is not a shipped general ingest/relink tool.

## Prepared PCM master linked and reopened

The subsequent `scripts/research/qualify-native-pcm-link.mjs` run used actual stdio MCP preview/apply to create a unique empty bin, link the checksum-qualified MOV once, read its master, close/save the bin, reopen it and verify the same master identity. Calls are journaled after each response; the script does not retry a mutation. The prepared MOV and original selects bin hashes remained unchanged.

- Bin: `MCP_PCM_6670b0b6.avb` in the disposable Sonoma 30p project.
- Master: `Sonoma_SourceClock_Stereo`, native MOB `060a2b340101010001010f0013-000000-570c581977aa752c-9972045256f7-4dd2`.
- Saved-bin SHA-256: `516cb23a5f14a923529a1db64435ff44cacf5aba515d572f0c4ede374e3d6faa`.
- Evidence: `.avid-mcp-analysis/native-pcm-link-4f20d2e6-cab0-41e9-8c6a-a25528ee2898/evidence.json`, with complete call journal adjacent.

Avid reports 30 fps, 5726 frame-count duration, PCM 48000/24-bit, `Stereo: A1A2`, UME Link and the expected source file/path. Its color fields report `Rec.709 [full range]` and `Levels scaling (full range to video levels)`. Geometry metadata is inconsistent: Image Size is `1920 x 1080`, while Raster Dimension is `1280x720p`, Format is `720p/30` and the codec label includes HD720p. These are observed host declarations, not assertions that the decoded image has either geometry. The prepared file's independent probe and copied-video checks remain authoritative for the file itself.

This closes only the prepared asset's link/bin-reopen step. No new sequence or render uses this master yet. Next checks must preserve the stereo master mapping through AAF or native sequence creation, verify actual decoded output geometry/timing/color, and compare audio against the original source presentation clock. Do not infer fidelity from these metadata fields or apply a geometry correction without decoded evidence.

## PCM sequence import and exact rendered audio

The next experiment completed that new sequence/render path:

1. `scripts/research/export-native-pcm-aaf.mjs` exported the fixed linked master using the installed host, the native write lock, source/project/owner checks, a recorded single export attempt, stable output polling and an AAF-container check. Export evidence: `.avid-mcp-analysis/native-pcm-aaf-7e173226-261d-4e72-95fb-c2e705dd1a0c/`; template SHA-256 `5c04dea1552933d8b171af3898e83fcc165709e4f283c1ba9af6b3dc4b66802d`.
2. `scripts/research/build-pcm-selects-mcp.mjs` used the real MCP template inspector and AAF builder. The template has one picture and two sound slots at 30 fps, with a single locator to the verified PCM MOV. The builder created `MCP_PCM_AAF_Selects`, two 60-frame cuts starting at 2850/3300 on three mapped slots, and reopened the resulting AAF for conformance. Evidence: `.avid-mcp-analysis/pcm-selects-mcp-f5a64b29-f0f8-4a5d-8884-f05ce760bb1a/`; generated AAF SHA-256 `823befe43a192982e25b6c882dd85865595fdcf1184eec03e838206d74e57aa6`.
3. `scripts/research/import-pcm-selects.py` imported that fixed AAF once into new bin `MCP_PCMAAF_dcf153d5.avb`, with a native write lock and per-response journal, then closed/reopened the bin. Avid reports 120 frames at 30 fps and `V1 A1 TC1`. The new native sequence MOB is `060a2b340101010501010f1013-000000-a376a03c12888806-8062d8bbc16d-18d9`. Bin SHA-256 is `d25e3c5533053cfb3122fb950c0d4199152aef6101dc461816c0a319bf41ed32`. Original media/AAF/selects bin remained unchanged. Evidence: `.avid-mcp-analysis/pcm-native-import-d80e3163-eaec-4c4f-8399-44bf01c270b9/`.
4. `node scripts/research/qualify-native-render-mcp.mjs --pcm-selects` exported the new sequence through real MCP preview/apply using the stereo/legal-range preset. All 120 frames decoded and token replay was refused. Render SHA-256: `8fd3fb4c04d24f3fd2200e600dab3e16edb1ad0329384a6814d1cb22d5f85cc0`. Evidence: `.avid-mcp-analysis/native-render-mcp-e0f60e5d-67c3-49ac-9ba0-7de71d73453c/`.

The new audio comparison's `--require-source-clock-stereo` mode verifies that the entire decoded stereo output equals the original source-clock cuts after both are converted to 24-bit PCM, and that rendered channels are not identical. This render **passed exact PCM SHA-256 equality**. Corresponding channels also measured zero lag and unity gain on both cuts. The earlier dual-mono render was correctly rejected by the same strict mode. Correlation scores are now clamped to their mathematical range to avoid floating-point roundoff slightly exceeding one.

Final audio evidence is under the new render's `native-export-2984bde7-47e5-4d40-a287-886f9aeb454d/export/audio-comparison-e38df87e-549c-460e-bf86-74db6a7280e1/evidence.json`. Frame comparison in adjacent `frame-comparison-b18c527d-8f19-4442-890a-3b95863194f5/evidence.json` retains the same 120 source-clock timing matches and unresolved color differences as the previous legal-range export. Actual decoded output is 1920x1080; conflicting master metadata does not prevent that output contract, but general source geometry interpretation remains unqualified.

The saved-bin parser confirms both picture cut ranges but sees the stereo sound nodes as opaque `TKFX` components. That parser limitation remains open even though rendered PCM equality verifies this fixture's audio output. No Direct Out change, manual panning, timing slip or gain correction was needed for this prepared-source/stereo-master path. This is a successful four-second fixture with exact rendered audio, not a general ingest remedy, complete timeline parser, color qualification, perceptual review or proof across other codecs/rates/hosts.

The subsequent [saved stereo timeline update](SAVED_STEREO_TIMELINE.md) resolves source-reference extraction for this specific two-child channel-combiner form. Actual MCP range/usage queries now retain both channel references and correct source overlaps. Other TKFX variants, effect parameters, nested groups and retimes remain outside that qualification; color and broader render acceptance are unchanged.

## Range-tag diagnosis and separately corrected copy

A fresh independent probe confirms the original Sonoma video is **1280x720**, full-range BT.709, and the Avid render is **1920x1080**, tagged limited-range BT.709. The earlier master `Image Size: 1920 x 1080` observation must not be treated as the encoded source dimensions: the source probe and Avid's 720p raster/codec fields agree. Output scaling and source geometry are distinct.

The frame-comparison script now accepts `--render-range-full` for a diagnostic decode override only. On the original PCM-sequence render, interpreting the same encoded pixels as full-range reduced mean best-match RGB RMSE from 10.9395 to 0.8449 and mean RGB shift from -8.4271 to +0.2397 on the 0–255 scale. All 120 best matches still map to the intended source presentation timestamps. Diagnostic evidence is under that render's `frame-comparison-3ee5e6fd-ce13-4e6a-b82d-a50ab41b4823/evidence.json`. This strongly supports a range-declaration mismatch in this tested native output, not a general rule about Avid exports.

`scripts/research/qualify-render-range-tags.mjs` creates a **new** copy of this checksum-selected render, setting H.264's full-range VUI flag and the container range declaration. It copies video/audio streams without encoding. Hashes of all non-parameter-set H.264 units (including picture slices) and audio packets remain identical; the original render hash is unchanged. It is fixed-fixture research, not an automatic production export correction or an edit to the Avid preset.

The new file is `.avid-mcp-analysis/render-range-tags-7a26beb3-2085-44f1-97f5-bdb413f52ace/render-full-range.mp4`, SHA-256 `c6e125caaeb2c2321f8fd7f762447c0621bbf325d1b528ca9140b914f56d5bca`. Adjacent `evidence.json` records the before/after probes and packet hashes. Ordinary metadata-based decoding, without an override, now produces exactly the same RGB metrics as the diagnostic override: RMSE 0.844857 and mean shift +0.239652. Evidence: `frame-comparison-9246c7a0-14ca-4513-a146-c7df80a87c37/evidence.json`. The complete decoded frame-checksum listing also stays unchanged, supporting that pixel content was retained while interpretation changed.

The corrected copy passed `compare-native-render-audio.mjs --require-source-clock-stereo`: entire 24-bit PCM equals the source-clock reference and channels remain distinct. Evidence: `audio-comparison-cba3cd91-dc20-424c-8058-73d4e905ed52/evidence.json`.

This materially resolves the observed dark rendering in the diagnostic comparison for this fixture. It does not certify full-resolution color conformance, all viewing pipelines, all presets/codecs or a general automatic range override. Native output remains unchanged and incorrectly interpreted under its declared range in this experiment. Further work must qualify the native range behavior and any explicit downstream correction contract across representative sources before shipping it as a general feature.

## Declared color-contract enforcement

Native render contracts now optionally require an explicit range and exact space/transfer/primaries tags. The verifier refuses missing or mismatched requested declarations and reports `colorTagsChecked` on success. These checks remain distinct from pixel conformance and never rewrite tags.

An actual MCP export of the PCM sequence with `tv/bt709/bt709/bt709` passed 120-frame full decoding, tag checks and consumed-token replay refusal: `.avid-mcp-analysis/native-render-mcp-475a5163-efeb-4a4c-af6c-c1fac61885cd/`. The new container SHA is `7b6961369bf13398bccb91ef0d37b42acd5ecc813336d805693ab75f616faee6`. This verifies the observed declarations, including the previously established interpretation limitation.

`scripts/research/qualify-render-color-contract.mjs` independently verified the prior native file as limited-range and corrected copy as full-range, then refused a full-range contract against the native file. Files stayed unchanged and no export RPC was issued by this comparison. Evidence: `.avid-mcp-analysis/render-color-contract-0baf0f72-67f0-4e34-bd25-56a14a3568fa/evidence.json`.

The initial real mismatch experiment exposed a final-probe deadline error masking the already-observed mismatch. The verifier now preserves that mismatch when the observation deadline expires and retains the process timeout as the error cause. A regression test covers this path alongside absent/mismatched tags, range-only contracts, malformed fields and legacy callers.

## Full-raster image comparison

`scripts/research/compare-native-full-resolution.mjs` compares all 120 output frames at 1920x1080 in planar 8-bit RGB. It selects the previously verified source presentation-time frame indices, upscales the 1280x720 source with Lanczos, and computes per-frame SSIM and MSE. Aggregate PSNR is calculated from mean MSE, rather than averaging per-frame dB values. Each output is decoded using its ordinary metadata declarations; there is no range override. The script verifies all 120 metric records, retains exact commands/logs and rechecks all input hashes.

| Existing output | Mean SSIM | Minimum frame SSIM | RGB RMSE | Aggregate PSNR |
| --- | --- | --- | --- | --- |
| Native limited-tagged render | 0.784061 | 0.529518 | 11.1167 | 27.2113 dB |
| Separately full-range-tagged copy | 0.962604 | 0.908042 | 4.2969 | 35.4678 dB |

Across the cut, output frames 59 and 60 improved from SSIM 0.829071/0.822046 to 0.946721/0.975954 respectively. This extends the earlier 96x54 diagnostic with full-output-raster evidence. The corrected copy has unchanged encoded picture units and exact source-clock PCM as established above; the higher full-raster residual includes compression, color conversion and potentially differences between Avid's scaling kernel and the Lanczos reference. This experiment does not isolate their individual contributions.

Evidence: `.avid-mcp-analysis/full-resolution-08fa8012-6c23-4dbb-b6c1-921bb0522ecb/evidence.json`, with per-frame SSIM/PSNR logs and executable argument manifests adjacent. Source, native render and corrected-copy hashes stayed unchanged. No preset/editor/media changes were made. These similarity metrics establish measured improvement for this fixture, not a universal pass threshold, perceptual review, mastering certification or broad native-color qualification.

## Export after a full host restart

Following the normal UI exit/relaunch and Sonoma project reopen recorded in NATIVE_AAF_IMPORT.md, actual MCP preview/apply exported the already-imported sequence from host PID 130720. Full decode retained 120 frames; zero video/audio start expectations and limited-range BT.709 declarations passed; replay was refused. Evidence: `.avid-mcp-analysis/native-render-mcp-7e4494af-238a-459f-8fd5-1832ea123316/evidence.json`.

The new MP4 SHA-256 is `c827ad88c9c603c903b234a4e57d12e621a120bded8992813bbdfc87fa906ca6`. Its complete decoded frame checksum listing remains `f2febfe806558dfc4f118a07d1b73b24b4e539698d89df69eff5e3136be964c6`, identical to the pre-restart PCM export. Stereo 24-bit PCM again exactly matches the original source-clock cuts and retains distinct channels. All 120 video frames retain the same presentation-time correspondence (maximum residual 0.334 microseconds) and diagnostic color error (mean RGB RMSE 10.9395). The source and output files were unchanged by comparison.

Under `native-export-9f491623-9d98-4a4a-893b-3fa86b2e5473/export/`, the audio report is `audio-comparison-67354d9f-be96-4b78-8ee1-f6fa529a38f2/evidence.json` and the frame report is `frame-comparison-f709690f-4488-4521-8f54-950d3d0264d1/evidence.json`. A separate saved-snapshot MCP range check confirmed the imported bin checksum and all six video/stereo source references were unchanged (`ranges-996377f5-820f-4ef2-ac31-284d3db12629.json` under the original native import evidence directory).

This qualifies this saved sequence's export after this normal application restart. It does not establish crash recovery, operating-system restart, every native operation across restart, general media/codec support or color/perceptual fidelity.
