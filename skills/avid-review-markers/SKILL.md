---
name: avid-review-markers
description: Apply requested review notes as verified native Avid clip markers, or prepare a marker package when a qualified host is unavailable.
---

Read `avid_get_capabilities` and the current schemas for `avid_native_read`, `avid_native_preview` and `avid_native_apply`. The native adapter requires a qualified local binary and current project access.

1. Read the project, bins, target clips and existing markers. Resolve the requested clip to an observed MOB ID and bin; ambiguous names require disambiguation before writes.
2. Convert review timestamps to the target's edit units using its observed rate and time origin. Do not interpret displayed source timecode as a zero-based marker offset. Preserve the requested track, text and color.
3. Preview each `add_marker`, `change_marker` or `delete_marker` operation. Review the returned state and blockers, then apply the exact token within the user's authorized scope. Tokens are single-use; a stale-state failure requires a fresh read and preview.
4. Read markers again and compare GUID, offset, track, comment and color. After an uncertain write result, read first to avoid duplicate notes. Do not blindly replay a consumed token.

If native execution is unavailable, use `avid_validate_marker_package` to validate a prepared package against the current schema and report that no host change occurred. Do not substitute an unqualified UI macro for native confirmation.

Return verified changes and any unresolved notes. Saved-bin persistence needs a separate save/reopen check; an in-memory read proves only the current host state.
