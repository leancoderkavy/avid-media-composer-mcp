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

## Resumed source navigation and restoration

After reselecting the current returned Avid window, the resumed observation showed the source workarea and Active Palette. Accessibility still reported only main-window focus, not a trustworthy source-pane focus identity. The baseline observer confirmed the same source mob in `MCP_Load_7006b4d8.avb` at native frame 0.

| Single observed command | Independently read native result |
| --- | --- |
| Go to End after the earlier source-workarea focus click | Frame 120, `01:00:04:00`; the initial expectation of 119 failed |
| Go to Start | Frame 0, `01:00:00:00` |
| Go to End with the newly derived boundary expectation | Frame 120, `01:00:04:00`; passed |
| Step Backward 1 Frame | Frame 119, `01:00:03:29`; passed |
| Go to Start, restore Button to Button Reassignment, close palette | Frame 0, `01:00:00:00`; passed |

This fixture distinguishes an end boundary from the last playable frame. The earlier playback stop at 119 must not become the expected position for Go to End. The repeated end result tests that distinction after restoration; the failed 119 assertion remains retained evidence. All checks preserved source mob identity and before/after hashes for the fixture bin, protected AAF bin, original Sonoma MP4 and server entry point. No edit, save or playback command was issued in this resumed experiment. The picture capture remained blank. Visible V1 TC1 values differ from the native viewer timecode and are not substituted for native position evidence.

Local evidence directories below contain `evidence.json` and the actual MCP `response.json`:

- Baseline: `.avid-mcp-analysis/palette-position-focused-baseline-8aaa547a-9fed-4094-8e42-4879133794ee/`
- Failed 119 expectation, actual 120: `.avid-mcp-analysis/palette-position-focused-end-7005a26b-822a-4993-b3cd-d213c6a193a0/`
- First start restoration: `.avid-mcp-analysis/palette-position-focused-start-bda44ec7-4c8e-4a81-b08f-17ac29e8a00c/`
- Repeated end boundary: `.avid-mcp-analysis/palette-position-end-boundary-a1549060-0f76-4021-b1e1-15fb2d214179/`
- One frame backward: `.avid-mcp-analysis/palette-position-back-one-53bb32db-d577-4fe0-b072-2171a4206c8c/`
- Final restoration: `.avid-mcp-analysis/palette-position-final-restored-d384adbb-522f-4395-88f4-fe2fbcc33ecf/`

Palette mode/closure screenshots and `restoration.json` are retained under `.avid-mcp-analysis/ui-palette-navigation-ba574b82-2a39-44f4-a1e0-022ef580333e/`. This establishes screenshot-guided command behavior for this source and host session. It does not establish unattended focus detection, reusable coordinates, record-viewer behavior, shortcut remapping, layout/scale resilience, video fidelity or a shipping UI adapter. The next implementation must preserve this distinction and detect source versus record targeting before issuing input.

## Native context guard

Read-only inspection of the qualified executable's locally derived schema found viewer type fields in `LoadMobsIntoViewerRequestBody` and `MobInViewer`, but no field named for active state or focus. This is evidence about that schema, not proof that no other Avid integration surface can report focus. `avid_native_read` with `query: "viewers"` now returns `keyboardFocusVerified: false` explicitly.

Viewer reads reject malformed or duplicate membership identities on either side of the position read, bind viewer and final membership RPCs to the initially observed listener owner, and recheck owner and canonical bin path. Four regression cases reproduced acceptance by the old implementation and now fail closed. These checks do not lock the editor or turn viewer membership into keyboard-focus evidence.

The full local check passed 817 TypeScript tests, 49 Python tests, stdio/HTTP and fresh-package checks (`.avid-mcp-analysis/check-viewer-context.log`). Actual read-only MCP inspection against the open Avid host returned the known Source at frame 0 with the explicit focus limitation and unchanged protected file hashes: `.avid-mcp-analysis/palette-position-guarded-context-0535da1f-1fd1-469e-b9ba-5ef160d1a990/`. This validates the guarded read, not a newly shipped UI input action.

## Discover the loaded viewer's bin

Call `avid_native_read` with `{"query":"viewer_bins"}` without supplying a bin. The result pairs each Avid-reported viewer type and mob ID with its authorized canonical bin path. Pass the returned `bin` into `{"query":"viewers","bin":"<returned path>"}` to inspect positions. This avoids assuming that the currently selected bin contains the loaded source, or scanning every open bin.

Discovery permits the same mob in Source and Record, but rejects duplicate viewer tuples, more than 16 viewer entries, unauthorized or non-AVB locations, malformed/duplicate bin membership, missing membership and observed identity/location changes. It checks locations and membership again, brackets viewer identities and current project, and binds reads to the observed listener owner. Any unresolved lookup fails the complete query; it does not emit partially authorized results. Playback positions are deliberately absent from discovery because they can advance during these sequential reads. It neither opens bins nor sends UI input. Copies sharing a mob ID remain a limitation of Avid's reported mapping, and `keyboardFocusVerified` stays false.

`scripts/research/qualify-viewer-bin-discovery.mjs` passed two actual MCP sessions, discovering the known Sonoma source bin, handing its returned path to position inspection, and observing frame 0 with unchanged protected file hashes. Evidence: `.avid-mcp-analysis/viewer-bin-discovery-8ad70673-a21d-434b-adac-a9c8f8bb6d6b/`. The full local check passed 827 TypeScript tests, 49 Python tests, stdio/HTTP and fresh-package validation (`.avid-mcp-analysis/check-viewer-bin-discovery.log`). Synthetic tests cover empty inventories, shared Source/Record identities, reordered enumeration and the documented refusal cases. These are bounded discovery checks, not atomic concurrent-editor exclusion or focus qualification.

## Actual AI-client acceptance

`scripts/research/qualify-codex-viewer-discovery.mjs` runs the existing authenticated Windows Codex CLI against a fresh development-package installation. It translates the package CLI's generated Codex setup arguments into ephemeral settings, exposes only `avid_native_read`, and grants only `inspect`. It does not install or alter the user's persistent MCP configuration.

The actual client made exactly two successful calls: `viewer_bins`, then `viewers` using the discovered Source bin path unchanged. It reported the expected mob ID, frame 0 and native `01:00:00:00`. Inspection of its final answer confirmed that it explicitly rejected keyboard-focus and atomic-snapshot claims. The harness also verifies no completed shell/input/file-edit tool calls, unchanged protected source/bin/package hashes, and unchanged existing Codex configuration. Native reads do not use Python or model-analysis runtimes.

Evidence is retained in `.avid-mcp-analysis/codex-viewer-discovery-2fcd7ccc-53d0-4232-8a1d-aa5f1295b3c3/`: actual `events.jsonl`, stderr, observations and passing evidence. The installed package root is recorded locally in `.avid-mcp-analysis/viewer-client-package-path.txt`. This establishes one installed AI-client read workflow on the qualified host; persistent GUI onboarding, other clients, clean-machine setup and AI-driven native edits remain separate acceptance work.
