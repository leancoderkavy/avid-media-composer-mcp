# Native duplicate-items research

On the qualified Windows Media Composer 2024.12.58720 host, `DuplicateBinItems` declares a `bin_path` and repeated `mob_id` request, returning repeated new MOB IDs. The extended research harness `qualify-native-copy.py --duplicate` first creates a unique owned bin and uses the existing copy operation to populate it. Only that new bin and its verified returned identities are eligible for duplication; protected original items are not duplicated in place or moved.

Actual execution on 2026-09-06 created `MCP_Copy_322e7c6bfa2f.avb`, copied the Sonoma selects sequence and duplicated the copied item once. Avid returned a distinct ID for the duplicate. The bin contained exactly the original copied ID plus that returned ID, with the original name unchanged. Selection moved from the copied original to the duplicate; duplication must not be presented as selection-preserving.

Native names were `MCP_Sonoma_AAF_Selects.Copy.06` and `MCP_Sonoma_AAF_Selects.Copy.06.Copy.01`. Computer use observed two four-second rows in the new bin, then focused its empty area and saved with Ctrl+S. The original protected bin's membership and saved bytes remained unchanged.

The read-only `verify-native-duplicate.mjs` compared the saved original, copy and duplicate through the independent AVB timeline decoder. The first verification attempt incorrectly compared native hyphenated UMIDs directly with saved dotted URNs and failed before comparison. The corrected verifier preserves all 32 identity bytes while converting only the observed display spelling. It then matched all decoded sequence fields except top-level name/MOB ID, and all reachable source records. One unresolved source ID is shared across the compared graphs; complete source resolution remains unproven. The original MP4 retained its known SHA-256.

Evidence beneath `.avid-mcp-analysis/`:

- `native-copy-520aa510-9579-4ac1-a735-6946b78b0b5f`: write attempt, native responses, membership and source preservation.
- `native-duplicate-saved-f51d5686-5a3c-438d-918a-6dba81847acd`: parsed saved graphs and passing comparison.

The retained owned bin has SHA-256 `8395e0435ad36a5197f431df7262e297e7c4815f942329cdd9d57993e4a95df1`. It remains available for follow-up reopen and recovery qualification. This is not yet a production MCP duplicate action: preview/state binding, batch/master behavior, failure/partial outcomes, reopen, undo and rendered fidelity remain to be qualified. Production native allowlists and tool counts are unchanged.

## Saved duplication after bin close/reopen

`qualify-native-duplicate-reopen.mjs` required the owned bin to match the saved experiment's hash before acting. Through the existing guarded MCP preview/apply operations, it closed and reopened only `MCP_Copy_322e7c6bfa2f.avb`. Both operations returned verified bin state. The two current native identities and names then matched their pre-close values exactly.

Independent AVB parsing found every decoded MOB and warning unchanged from the saved duplicate baseline, with the same bin SHA-256 `8395e0435ad36a5197f431df7262e297e7c4815f942329cdd9d57993e4a95df1`. Protected original bin/media hashes were unchanged. Evidence: `.avid-mcp-analysis/native-duplicate-reopen-d64b1c88-bf99-4929-829d-51f7eda3cf4b/evidence.json`, with recorded MCP calls and the reopened graph.

This qualifies bin-reopen persistence for this saved sequence duplicate. It does not prove that duplication undo history survives closure, qualify an application restart, or ship a general duplicate action. Guarded duplication preview/apply, stale-state/partial-failure tests, batches/master clips and rendering remain open. Harness syntax, diff checks and actual execution passed; production code is unchanged.
