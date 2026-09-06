# Source-viewer navigation qualification

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
