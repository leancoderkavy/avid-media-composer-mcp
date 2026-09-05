# Native AAF research qualification - Windows 2024.12

This is real-host research evidence, not a shipped general timeline adapter. It uses the installed binary's descriptors and user-owned media; no Avid SDK or vendor descriptor payload is included.

## Observed export contract

The installed host reported import preset `Untitled` and export presets `AAF`, `Export To Pro Tools`, and `Untitled`. Exporting the Sonoma preview master with `destination_path` alone returned Completed with no AAF in the checked locations. Supplying an absolute `in_directory` failed with Can't create directory. Supplying the relative child name `export` created the AAF in that child directory. Avid appended the extension to `Sonoma_reference.aaf`, producing `Sonoma_reference.aaf.aaf` (405504 bytes). This demonstrates why a Completed response must be followed by actual output verification.

The AAF contained one exported master, picture/audio/source mobs, AMA-related descriptors and media locators. Its master had three 30 fps tracks. The original MP4 SHA-256 remained `3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca`.

## Selects sequence experiment

A copy of the exported AAF received a new top-level composition, `MCP_Sonoma_AAF_Selects`, with picture and two sound tracks. Each track references two source ranges: [2850,2910) and [3300,3360), yielding 120 frames at 30 fps. The exported descriptors were preserved; we did not invent source codec descriptors.

A separate bin `MCP_AAF_Selects_20260905.avb` was created in the disposable project `MCP_Sonoma_30p_20260905`. Native ImportFile used the generated AAF, the Untitled preset, that destination bin and Import_StopIf_Media_No_in_DB. The host returned an exported master and the new composition. GetMobInfo reported duration 4:00, V1 A1-2 TC1, 30 fps, and 120 frames. The composition's native MOB ID changed during import; callers must discover post-import identity rather than assume the input AAF identity remains stable.

After bin close/reopen, the saved AVB independently showed a CompositionMob with usageCode 0, duration 120, and two SourceClip components on each media track. Their timeline ranges were [0,60) and [60,120), with source starts 2850 and 3300. Avid mapped AAF audio slots 2/3 to sound track indices 1/2. It added timecode starting at 01:00:00:00.

Computer use loaded the composition. The Avid timeline visibly contained two consecutive blocks on V1, A1 and A2 and displayed a four-second duration. The captured viewer stayed black. Subsequent computer-use export produced real video; see [render qualification](NATIVE_RENDER_QUALIFICATION.md). Visible playback, audio/color fidelity, relink and undo/recovery remain **not verified**. No general AAF or native import/export tool is advertised from this experiment.

## Reproducibility and retained local evidence

- `scripts/research/qualify-native-aaf-export.py`: fixed owned-source export probe; validates installed hash/listener/project/source/preset, records each response and verifies the observed output path. Run only when a new research export is intended.
- `scripts/research/build-aaf-selects.py`: fixed three-track two-cut builder using a supplied Avid-exported Sonoma AAF. Creates a new output exclusively, validates rates/ranges and reopens the result for conformance. It does not import into Avid.
- Ignored export/import receipts: `.avid-mcp-analysis/native-aaf-641ea933-1b82-46f0-bfd9-fb5af6b86acf/`.
- Saved AVB semantic evidence: `.avid-mcp-analysis/aaf-import-saved-snapshot.json`.
- The new Avid bin and generated AAF files remain local for subsequent playback/render/adapter qualification.

Next work: package a constrained reference-preserving AAF builder, preview and validate source mappings, serialize native export/import with post-state identity discovery, and qualify playback/render/reopen/undo. Extend to multiple source masters, varied rates and managed media only with separate evidence.

## Current-host refresh, 2026-09-05

Media Composer was observed open in MCP_Sonoma_30p_20260905, with no activation dialog blocking the project. Inspect-only native MCP app/project/bin/sequence reads succeeded. Independent saved-bin indexing again verified duration 120 at 30 fps and the original two source ranges on picture and both audio tracks. The bin SHA remained 44b54618a6019c3fdf06c1fc707809407394e84bddb4755be7d67c75b4d2477c and original Sonoma MP4 hash matched the recorded source. Reproduce with `node scripts/research/qualify-native-reopen.mjs [PYTHON_EXECUTABLE]`; the default is the repository venv containing pyavb/pyaaf2. Evidence: .avid-mcp-analysis/native-refresh-d3ed82a6-a27c-426d-bda4-3f34744d4ca6/evidence.json. This observes the already-open project; it does not prove an assistant-driven full editor restart.

Computer use now captured a nonblack vineyard image in the record monitor. Seeking changed the timeline timecode to 01:00:02:29, and pressing Play advanced to 01:00:03:29. Repeated captures showed the same monitor image, so motion/frame correctness and audio fidelity remain unverified. The sequence was returned to 01:00:00:00. No sequence edit, import or export was performed during this refresh.

The raw inspector initially failed while streaming Unicode AVB metadata through a Windows legacy-encoded stdout stream, leaving partial JSON. It now emits ASCII-escaped JSON for success and errors, preserving Unicode after JSON decoding. The actual bin reinspection passed, with synthetic cp1252 stdout regressions for both success and error payloads.
