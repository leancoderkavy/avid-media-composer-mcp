# Windows Command Palette targeting

Computer-use inspection on 2026-09-06 found the running `MCP_Sonoma_30p_20260905` project in Avid Media Composer Ultimate. The current source viewer showed a copied four-second fixture; its captured picture area remained blank. This session inspected menus and palette tabs only. It did not execute a transport command, edit, import or save.

The main accessibility tree exposed the Avid window, two `CW_monitor` panes and title-bar controls. Composer and Tools menu commands were visually legible but did not appear as individually actionable accessibility nodes. Tools displayed **Command Palette — Ctrl+3**. Opening it exposed an owned `Command Palette` window in the main tree, though `list_windows()` did not return it separately.

The palette opened on Move with **Button to Button Reassignment** selected. **Active Palette** and **Menu to Button Reassignment** were unselected. Play-tab labels included Play, Play Forward/Reverse, Dynamic Play Forward/Reverse, Play to OUT, Play IN to OUT, Play Loop, Audio Loop Play, Pause and Stop. Neither these labels nor the mode controls appeared in the accessibility tree. Do not infer execution authority or behavior merely from a recognizable command icon: the observed palette was in reassignment mode.

| Attempt | Observed result |
| --- | --- |
| Select Play tab using a fresh screenshot coordinate | Play commands became visible; no command executed |
| Restore Move tab | Original command category visible again |
| Click observed accessibility Close index 16 | Input API rejected the index as unavailable in cached app state |
| Ctrl+3 after refreshing state | Palette remained open |
| Escape after refreshing state | Palette remained open |
| Drag visible title bar to bring its Close button inside the main capture, then click that observed button | Palette closed; main project window remained |

The palette position changed during restoration. Reassignment mode was not changed. Source name/timecode appeared unchanged, but this session did not capture independent pre/post native state or file hashes, so it does not claim source preservation or transport fidelity beyond the visible observations.

Evidence remains local under `.avid-mcp-analysis/ui-command-palette-063e433b-f2aa-49a7-ab49-d93af3c54d51/`: `observation.json`, full and palette screenshots, and `restoration.json`. Screenshots are not reusable coordinates. The result qualifies neither generic UI Automation targeting nor a production playback adapter.

The next controlled execution experiment must establish source/record viewer identity and native frame position independently, detect palette mode and unexpected windows, execute exactly one named command, and verify its result before any retry. A shipping adapter also needs verified focus, shortcut remapping, layout/scale changes and mode detection. A screenshot-guided human-equivalent action is not evidence that a fixed coordinate or arbitrary keyboard sequence is suitable for unattended use. See the separate [source playback observations](NATIVE_SOURCE_PLAYBACK.md).

## Follow-up navigation checkpoint

The read-only `scripts/research/capture-palette-position.mjs` observer records native Source identity/frame and before/after hashes of the fixture bin, protected AAF bin, original MP4 and server entry point. It accepts a label alone for a baseline, or a label, baseline evidence path and expected frame for comparison. It is specific to this local research fixture and does not perform UI input.

The first attempted baseline used the visible selected bin, which did not contain the loaded native source. Read-only bin discovery identified `MCP_Load_7006b4d8.avb`; the corrected baseline reported frame 0. With Active Palette selected, one observed Go to End click left the native source at frame 0 rather than the expected 119. The observer rejected that expectation and confirmed unchanged file hashes. This is a failed navigation qualification, not a supported command.

Retained local evidence: `.avid-mcp-analysis/palette-position-active-baseline-938a5ea4-d6ec-4724-a7de-ef45f0b9a282/evidence.json` and `.avid-mcp-analysis/palette-position-go-end-a9d60539-c5fc-4db7-bd07-a366c9eaabb2/evidence.json`. A subsequent source-focus observation was interrupted before its output could be assessed; no successful second navigation or final palette-mode restoration is established by this checkpoint.
