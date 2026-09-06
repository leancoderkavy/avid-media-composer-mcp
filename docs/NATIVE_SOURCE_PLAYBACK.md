# Source-viewer playback observation

On 2026-09-06, Windows computer use observed the existing disposable `MCP_Load_7006b4d8.avb` source fixture in Media Composer Ultimate 2024.12.58720, project `MCP_Sonoma_30p_20260905`. The read-only `capture-native-seek-position.mjs` observer independently checked the selected source MOB, native frame/timecode and protected file hashes before and after the UI actions.

| Stage | UI action or observation | Native source frame | Native timecode |
| --- | --- | --- | --- |
| Baseline | Source viewer loaded; captured picture area blank | 0 | 01:00:00:00 |
| Playing | Clicked the visible Source Play button; playhead moved, top counter changed and audio meters showed green activity | Not sampled during motion | Not sampled during motion |
| End | Later screenshot showed playhead at the right edge and inactive meters | 119 | 01:00:03:29 |
| First restoration attempt | Home key after the Play-button focus | 119 | 01:00:03:29 |
| Restored | Clicked the observed left edge of the Source ruler | 0 | 01:00:00:00 |

The Home-key attempt did not restore the position; the observer retained its mismatch and exited with failure. No repeated blind key input followed. A refreshed screenshot supplied the ruler coordinate, and a fresh MCP read verified frame-zero restoration. This result is specific to the observed focus and current keyboard mapping; Home must not be advertised as a verified seek command here.

Evidence directories beneath `.avid-mcp-analysis/`:

- `ui-seek-playback-baseline-d37fcd92-42e0-4e9d-87bb-211480dfe2d6`
- `ui-seek-playback-end-a803c5c9-9601-49a2-b40a-dbe1a956ff98`
- `ui-seek-playback-restored-f2ac8c1f-3be5-49c4-97d1-0c33066c5fff` (retained failed Home expectation)
- `ui-seek-playback-ruler-restored-643b71d7-4825-481b-8e5e-bd29998030bd`

Each contains the actual MCP response and a hash-checked evidence record. The fixture bin remained SHA-256 `e44449e45a087468fc8e344ff0115e269a67702e05b53e3ef5991da7ce7da84a`; the protected source bin and original MP4 also remained unchanged. No edit or save was requested.

This establishes an observed source transport cycle and explicit positional restoration. The captured video area remained blank throughout: these screenshots cannot distinguish absent rendering from a capture limitation. Meter activity does not establish audible output, sample correctness or lip sync. Native frame readback and the top V1 TC1 display use different coordinates and must not be conflated. Record-viewer playback, visible scene changes, cadence, dropped frames, audio quality, native edit fidelity and a shipped UI action adapter remain unqualified.
