# Native duplicate-items research

## Guarded MCP action

`avid_native_preview` now accepts `{action: "duplicate_clip", bin, mobId}`. Apply its returned token with `avid_native_apply`. Preview requires inspection/edit authority and binds the scoped bin path/hash, current native item inventory, project and listener owner. Apply rechecks this state under the native lock, consumes the token before dispatch and invokes `DuplicateBinItems` once. This binding does not capture a complete unsaved sequence graph.

Post-read must find exactly one new returned ID and preserve all prior item fields except `mob_selected`, which Avid may change. Missing/extra/reused IDs and unrelated item changes withhold `duplicateIdentityVerified`. A lost write response is not retried. `sourceFidelityVerified` and `persistenceVerified` remain false; `selectionMayChange` is true. Identity verification does not establish copied timeline semantics, undo or persistence for an arbitrary target.

Actual MCP execution added a third item to the owned bin, with new ID `060a2b340101010501010f1013-000000-ba9f49dd12898806-c9bad8bbc16d-18d9`. Both prior IDs/names remained, token reuse was refused, and protected original bin/media hashes were unchanged. Evidence: `.avid-mcp-analysis/native-duplicate-mcp-a69f0f95-fc1b-452c-b3d4-8b60e55bb667/evidence.json`. Subsequent saved/reopened graph qualification for this item is recorded below; the earlier research duplicate has separate evidence.

Full local validation passed 790 TypeScript tests, 46 Python tests, transports and fresh-package/Python/AAF checks (`.avid-mcp-analysis/check-native-duplicate.log`). Regression cases include ignored writes, extra items, renamed originals, reused IDs, stale saved bins, uncertain responses and consumed tokens. The native allowlist is now 16 reads/17 writes; MCP count remains 143 tools. Batch/master accuracy, unsaved graph equivalence, failure recovery, undo and rendered fidelity remain open.

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

## MCP-created duplicate persistence

Computer use observed three four-second rows in the owned bin, focused its empty area and saved with Ctrl+S. `qualify-native-duplicate-mcp-persistence.mjs` then verified exactly one added decoded MOB relative to the prior two-item saved baseline. Every prior MOB and warning matched unchanged; the new sequence matched its selected source except top-level name/MOB ID. The same three native identities/names persisted through guarded MCP close/reopen, and every decoded MOB/warning matched the pre-close graph.

Saved and reopened SHA-256 were both `91c4b94d67229540476fcda5c45b1ba767fa45275482d28e2a4bc26f95c735a0`. Protected original bin/media hashes matched the preceding MCP receipt. Evidence: `.avid-mcp-analysis/native-duplicate-mcp-persist-3e925c36-3b5a-4731-9a59-fc5d9757039e/evidence.json`, with saved/reopened graphs and MCP responses. This qualifies persistence and decoded structure for this MCP-created fixture; the general action correctly continues to return `persistenceVerified: false` and `sourceFidelityVerified: false` until those properties are independently checked for each result. Undo, application restart, unknown fields and rendering remain open.

The action commit's macOS CI failed six new fixture assertions because temporary `/var/...` paths canonicalized to `/private/var/...` before dispatch. The test now compares the expected `realpath`, preserving strict path equality and production behavior. The 124 focused native tests passed locally after correction; hosted validation of the correction is separate. Retained failure log: `.avid-mcp-analysis/ci-native-duplicate-failure.log`.
