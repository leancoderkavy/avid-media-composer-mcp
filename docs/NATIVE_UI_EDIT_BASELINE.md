# Native UI editing baseline

On 2026-09-06, computer use reacquired the running Avid Ultimate window for MCP_Sonoma_30p_20260905. The original four-second selects sequence was visible at 01:00:00:00 with picture and two audio tracks. The Windows accessibility tree exposed only the outer window, monitor panes and title-bar controls; timeline clips and application menu commands were absent from that tree.

The observed Edit menu contained Undo (Ctrl+Z), Redo (Ctrl+R), and Undo-Redo List, disabled in that context. Timeline and Composer menus were also inspected; no edit command was invoked. These labels do not establish current undo history, keyboard-map stability, or undo support for native API writes. Menu navigation was dismissed before native preparation.

The existing guarded native MCP copy workflow created MCP_CopyMCP_93108dc0c7b8.avb with one new sequence, MCP_Sonoma_AAF_Selects.Copy.05, mob ID 060a2b340101010501010f1013-000000-184e5ee212898806-7c27d8bbc16d-18d9. The original source membership remained present. Copy evidence: .avid-mcp-analysis/native-copy-mcp-103baedc-9615-4d54-8b7c-2c42f5e88dbd.

The fixture-specific scripts/research/qualify-native-ui-baseline.mjs closes/reopens this owned bin, checks its single member identity, reads native track information and preserves baseline.avb outside the project. Completed evidence: .avid-mcp-analysis/native-ui-baseline-9f2e25b7-5a40-44c8-95fd-958da0aab9ef/evidence.json; baseline size 42,311 bytes. This script captures a baseline and must not be rerun after editing as if it restored the fixture.

Next acceptance: load this exact copied sequence into the record viewer, independently decode its saved graph, apply one bounded edit, save/reopen and compare ranges, then qualify undo against that baseline. Use current screenshots for targeting and native/saved identities for post-state checks. No trimming, undo, general UI adapter, or playback fidelity is qualified by this baseline preparation.

Independent saved-graph verification subsequently passed via qualify-native-copy-graph.mjs --ui-copy. Decoded sequence semantics (excluding new name/identity) and four reachable source records match the original. Both retain the same unresolved anchor; graph completeness remains false. Evidence: .avid-mcp-analysis/native-copy-graph-9c792dd0-e818-432a-bfe0-ccaa3e5e96d4/result.json. The current disposable bin matches the preserved baseline byte-for-byte: SHA-256 4b5154121a5c293f02abd64796e44ab6b20b961c7a38813ca5784960efcac97c. This establishes the pre-edit comparison baseline, not a trim/undo result.

