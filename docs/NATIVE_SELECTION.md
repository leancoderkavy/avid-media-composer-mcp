# Read and replace Avid bin selection

This unreleased development branch supports bin selection on the qualified Windows Media Composer 2024.12 build. Use the local native configuration in [local setup](LOCAL_SETUP.md). Reading requires `inspect`; previewing and applying a replacement also require `edit`. No Extensions SDK is needed for this separate native adapter.

## Read the current selection

Call `avid_native_read` with:

```json
{"query":"selected_clips","bin":"My Bin.avb"}
```

The bin must exist within the current authorized project. The returned `clips` array contains selected MOB IDs, native selection flags, and names when supplied by Avid. Empty means Avid reported no selected members in that bin. The adapter rejects malformed, duplicate and out-of-bin identities, caps inventories at 4096 entries, and checks project and membership around the read.

## Highlight results or clear selection

Use IDs from the target bin's `clips` read. Pass the exact IDs from the latest `selected_clips` read as `expectedSelectedMobIds`:

```json
{
  "operation": {
    "action": "select_clips",
    "bin": "My Bin.avb",
    "mobIds": ["TARGET_MOB_ID"],
    "expectedSelectedMobIds": ["CURRENTLY_SELECTED_MOB_ID"]
  }
}
```

Send this to `avid_native_preview`, review the returned operation, then send its token to `avid_native_apply`:

```json
{"token":"TOKEN_FROM_PREVIEW"}
```

This replaces selection. Set `mobIds` to `[]` to clear it. To preserve existing selection while adding results, explicitly include both sets of IDs in the replacement list; the native additive mode has not been qualified. Do not invent MOB IDs from names or media file paths.

The token expires after five minutes and can be used once. Changes observed between preview and apply reject the operation. A successful response has `applicationCompleted:true`; require `selectionVerified:true` before claiming that the requested selection was observed. Verification checks the native response and a fresh selection read. Clearing can return no native response body, but still requires an empty post-read.

## Recover from a mismatch or lost response

Read `selected_clips` again. Do not replay the token or assume that an error means nothing happened. To restore a prior selection, create a new preview with the old IDs as targets and the newly observed IDs as the expected selection. No automatic retry or undo is performed.

Checks are optimistic, not an atomic compare-and-swap with Avid. A user can change selection between checks or after the result. Selection does not load a viewer, edit a timeline, or establish save persistence. Locked/shared-bin behavior and other builds need separate qualification.

## Evidence

On the Sonoma fixture, zero, one and two selected rows matched native reads and visible UI state. Native and MCP replacement, clearing and explicit restoration completed with independently read postconditions. The [completion ledger](COMPLETION_LEDGER.md) records the retained runs. Unit tests additionally cover stale selection, duplicates, out-of-bin IDs, denied edit authority, project changes, mismatched postconditions, and a lost response after an applied change. These injected failures are not live host fault-injection evidence.
