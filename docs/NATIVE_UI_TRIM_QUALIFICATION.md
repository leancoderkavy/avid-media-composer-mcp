# One-frame native UI trim and undo qualification

On 2026-09-06, computer use loaded the owned MCP_Sonoma_AAF_Selects.Copy.05 sequence from MCP_CopyMCP_93108dc0c7b8.avb into the record viewer. Its baseline is documented in NATIVE_UI_EDIT_BASELINE.md. A screenshot confirmed the copy name before editing.

With the position near the 60-frame cut, U entered dual-roller trim mode at 01:00:02:00 across V1/A1/A2. One period key moved both trim counters to 1. Ctrl+S saved the bin. Independent AVB decoding verified the exact edit: the first segment ends at frame 61, the second begins at 61 and its source start changes from 3300 to 3301; all three media tracks change identically. Duration remains 120 frames at 30 fps. The entire decoded sequence equals that expected transformation, including unchanged nonmedia tracks, identity, source references and other fields.

Ctrl+Z returned both counters to zero; Ctrl+S saved the undo. The complete decoded sequence equals the original baseline and all other decoded mobs remain unchanged. The binary hash differs after saving, so this is semantic restoration, not byte-for-byte undo. Trim mode was subsequently exited with U.

Evidence: .avid-mcp-analysis/native-ui-trim-20260906 contains baseline.json, trimmed.avb/json, undone.avb/json and verification.json. scripts/research/verify-native-ui-trim.mjs asserts the complete expected transformation and restoration. The baseline hash is 4b5154121a5c293f02abd64796e44ab6b20b961c7a38813ca5784960efcac97c; trimmed 7280e576e1fece04820ae8f756e3bce3e0874c8b7a42884cb6397b6cbbebd618; undone 7cee614e2e9bbbd8ed650e7cc4392b3147bface367be6e85a895ec11a791c1f2.

This is one observed manual computer-use workflow on Avid 2024.12, not a shipped UI adapter or native trim RPC. Post-edit close/reopen, redo, other trim modes, selection combinations, keyboard mappings, concurrent edits, unknown AVB fields and playback fidelity remain unqualified. The monitors remained black in captures. Do not infer undo support for native API mutations from this UI trim result.

Avid's [Media Composer User Guide](https://resources.avid.com/SupportFiles/attach/MC_UserGuide.pdf) provides trim-mode background. Actual key behavior and ranges above were established by the installed editor and saved-bin experiment, not inferred from documentation for another Avid product.

## Saved undo after bin close/reopen

The fixture-specific qualify-native-ui-undo-reopen.mjs first required the current bin checksum to equal the captured undone.avb, then used guarded MCP close_bin/open_bin operations and verified the single expected sequence identity. Independent parsing of a newly captured reopened.avb matched every decoded mob to the original pre-edit baseline, with no name or identity exclusions. Evidence: .avid-mcp-analysis/native-ui-undo-reopen-05c6a9f4-3c68-4b6f-900a-697bc4d1dc52/evidence.json. This closes bin-reopen persistence for the saved undo result only. It does not establish that undo/redo history survives closure or that the intermediate trimmed result was independently reopened.
## History availability after reopening

After the guarded close/reopen, computer use double-clicked the sole copied sequence, confirmed Copy.05 in the record viewer/timeline, focused the timeline ruler, and inspected Edit. Undo, Redo and Undo-Redo List were disabled. Select-All Tracks was present, confirming the timeline menu context rather than the bin context. No disabled history command was invoked. The menu was dismissed and the saved bin hash remained 7cee614e2e9bbbd8ed650e7cc4392b3147bface367be6e85a895ec11a791c1f2, equal to reopened.avb.

This is a negative acceptance result for retaining the prior redo action across this bin close/reopen, not a claim about every Avid history configuration. The future adapter must invalidate any assumed UI undo/redo availability when the bin closes, the sequence reloads or the host restarts. Recovery must inspect current state and retain verified before/after artifacts; it cannot blindly send Ctrl+R or Ctrl+Z based on an earlier successful edit. Same-session redo before closing remains untested.
