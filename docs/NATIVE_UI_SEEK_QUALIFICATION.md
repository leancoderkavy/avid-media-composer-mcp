# Source-viewer navigation qualification

## Master-timecode entry and restoration

A follow-up on September 6 selected `Master` under the monitor's Sequence Timecode TC1 menu. The visible counter changed from `V1 TC1 10:02:23:23` to `Mas TC1 01:00:00:00`, matching the native sequence clock. A Right-arrow input then advanced exactly one frame, confirming ordinary navigation reached the owned Source monitor.

An attempted left-Control double-tap and initial keypad activation did not expose a visible entry field. After one Num Lock toggle, keypad `+ 1 Enter` moved frame 1 to 2. With the master counter still selected, unsigned keypad `3 0 0 Enter` moved to frame 90 (`01:00:03:00`), establishing partial absolute entry rather than a relative 90-frame increment. Unsigned `0 0 0 Enter` restored frame 0. Each input was followed by a Computer Use observation; each completed navigation was independently checked through read-only MCP for the exact Source MOB and frame. The absence of a visible entry overlay did not imply that buffered keypad input was ignored.

The Num Lock toggle was repeated afterward and the counter menu restored to `V1 TC1`. Final MCP readback again reported frame 0 and `01:00:00:00`; saved bin, protected source bin and MP4 hashes stayed unchanged. Num Lock's initial Boolean state was not directly queried, so this records paired toggle actions, not an independently measured keyboard-state restoration. No save or timeline edit was issued.

Evidence under `.avid-mcp-analysis`:

- `ui-seek-master-right-one-503ec57e-0e6f-4b9e-bb4a-0622afd58668`: frame 1.
- `ui-seek-master-keypad-plus-one-7b16b248-26d6-442b-aad0-939d7df2047e`: frame 2.
- `ui-seek-master-absolute-ninety-30560cda-f5dd-4583-8632-9eefd7d45641`: frame 90.
- `ui-seek-master-absolute-restored-5eaea8fa-f62e-4034-958e-c55e93de1fd2`: frame 0.
- `ui-seek-master-display-restored-02789642-1d92-46f0-8fd2-3a8a298d6391`: final frame 0 after display/keyboard actions.

The [Avid 2025 editing guide, “Using Timecode to Find a Frame,” page 424](https://resources.avid.com/SupportFiles/attach/Media_Composer/Media_Composer_v2025.x_Editing_Guide.pdf) explains that the selected top tracking format determines interpretation and documents partial timecode entry and optional Control double-tap activation. These instructions informed the experiment; the observed 2024.12 host results qualify only this owned 30 fps sequence and these inputs. The experiment does not isolate counter choice versus keyboard state as the sole cause of the earlier failure. A shipped executor must observe the target, counter mode and input state, verify each resulting frame and avoid blind toggles or automatic retries. Full eight-digit absolute entry, other rates, arbitrary ranges, Record navigation and visual playback fidelity remain unqualified. Monitor pixels remained black.

## Absolute-entry attempt on September 6

Computer Use selected the current Avid window and clicked the owned Source monitor. The observer verified the same `MCP_Load_7006b4d8.avb` MOB at frame 0, sequence timecode `01:00:00:00`, with its retained saved hash. Individual keypad presses `0 1 0 0 0 3 0 0 Enter` attempted absolute `01:00:03:00` (frame 90 at 30 fps), with a screenshot refresh after every action. No timecode-entry field appeared; accessibility reported only the top-level window as focused. The subsequent native read still reported frame 0. The displayed counter remained configured as `V1 TC1`, showing underlying source timecode rather than the native sequence timecode.

This attempt failed to establish absolute seeking. It does not distinguish keyboard focus, keypad delivery, counter selection or entry-mode behavior, and does not prove that Avid generally lacks absolute entry. Do not ship this sequence as an unattended seek executor. No save or timeline edit was issued; final readback verified the original frame 0 and unchanged saved-bin/source hashes, so no compensating navigation was required.

Evidence under `.avid-mcp-analysis`: `ui-seek-absolute-baseline-a7f8a7f7-ebc9-4984-88cc-fe949d960e79`, failed raw response `ui-seek-absolute-ninety-25195b9d-1e25-4c1e-bc16-c80818aff9b8`, and final baseline `ui-seek-absolute-final-baseline-a08327af-7ce5-4427-922a-2e990fb510a9`. The observer now checks source hashes and writes explicit `positionVerified: false` evidence before failing a position assertion. Its mismatch path was exercised read-only in `ui-seek-absolute-mismatch-retained-d8d02244-19fc-4b40-bb6e-a252782136ef`, followed by the successful final baseline. Monitor pixels remained black; neither navigation result establishes visual playback fidelity.

## Earlier relative-entry evidence

On the qualified Windows 2024.12 host, computer use focused the Source monitor for the owned `MCP_Load_7006b4d8.avb` sequence and entered relative offsets with numeric-keypad keys, observing between inputs. The separate read-only `capture-native-seek-position.mjs <label> <expected-frame> Source` connected through MCP and required the exact MOB/viewer/frame, preserving the saved bin and source hashes. No save, timeline edit or native write was issued in this experiment.

| Input after baseline | Native frame | Native sequence timecode | Result |
| --- | ---: | --- | --- |
| Initial read | 0 | 01:00:00:00 | Baseline |
| Keypad +, 6, 0, Enter | 60 | 01:00:02:00 | Expected position |
| Keypad +, 5, 9, Enter | 119 | 01:00:03:29 | Last frame |
| Keypad -, 1, 1, 9, Enter | 70 | 01:00:02:10 | Failed expected return to zero |
| Keypad -, 2, 1, 0, Enter | 0 | 01:00:00:00 | Corrected return verified |

The three-digit entry `119` was interpreted as one second and nineteen frames (49 frames at 30 fps), not 119 frames. The observed correction used `210` for two seconds and ten frames. Do not concatenate a signed integer frame count and assume arbitrary offsets retain frame units. Larger offsets, absolute entry, drop-frame/fractional-rate cases, other keyboard mappings and Record navigation remain unqualified.

The visible monitor was configured to V1 TC1 and displayed underlying source timecodes; those differed from native sequence timecode, especially across the cut. Identity, viewer type and `current_frame` readback were therefore used to verify navigation. Black monitor captures do not establish visible-frame or playback fidelity. Fresh focus/state observation remains necessary; this evidence does not supply an unattended UI executor or a new MCP seek command.

Evidence directories under `.avid-mcp-analysis`:

- `ui-seek-baseline-9c6c346c-6baa-4278-ada5-af4bef73290b`
- `ui-seek-forward-sixty-58a7808c-3b60-4bc9-9ec4-2b3ec3dec604`
- `ui-seek-last-frame-2f8f4999-95f5-4c6c-b2c2-459592df9f81`
- `ui-seek-restored-c289cbcb-9d6f-47e5-9b07-a70e6b1af7ff` (retained failed response)
- `ui-seek-restored-corrected-1e50e8e4-36d9-4847-98ee-22d10b42b061`

Saved bin SHA-256 throughout: `e44449e45a087468fc8e344ff0115e269a67702e05b53e3ef5991da7ce7da84a`. Original source-bin/media hashes remained unchanged. The observer retains the raw response before asserting the expected frame, so a mismatch is not lost or silently retried.

The [Avid Media Composer 2025 editing guide](https://resources.avid.com/SupportFiles/attach/Media_Composer/Media_Composer_v2025.x_Editing_Guide.pdf) describes numeric-keypad timecode entry; the [8.7 guide](https://resources.avid.com/SupportFiles/attach/Media_Composer_Editing_Guide_8.7.pdf) describes signed offset entry after focusing a monitor. These references guided the experiment; the actual installed-host results above determine its qualified scope.
