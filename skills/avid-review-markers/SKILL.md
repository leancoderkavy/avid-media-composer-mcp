---
name: avid-review-markers
description: Apply requested review notes as verified native Avid clip markers or whole-clip Comments, or prepare a marker package when a qualified host is unavailable.
---

Read `avid_get_capabilities` and the current schemas for `avid_native_read`, `avid_native_preview` and `avid_native_apply`. The native adapter requires a qualified local binary and current project access.

1. Read the project, bins, target clips and existing markers. Resolve the requested clip to an observed MOB ID and bin; ambiguous names require disambiguation before writes.
2. Convert review timestamps to the target's edit units using its observed rate and time origin. Do not interpret displayed source timecode as a zero-based marker offset. Preserve the requested track, text and color.
3. Preview each `add_marker`, `change_marker` or `delete_marker` operation. Review the returned state and blockers, then apply the exact token within the user's authorized scope. Tokens are single-use; a stale-state failure requires a fresh read and preview.
4. Read markers again and compare GUID, offset, track, comment and color. After an uncertain write result, read first to avoid duplicate notes. Do not blindly replay a consumed token.

If native execution is unavailable, use `avid_validate_marker_package` to validate a prepared package against the current schema and report that no host change occurred. Do not substitute an unqualified UI macro for native confirmation.

For a requested whole-clip Comments edit, resolve the exact bin and MOB ID, then use `avid_native_read` with `bin_columns` and `clip_columns`. Require a writable String Comments declaration and a returned Comments row. The empty-inclusive read can report an empty value; an absent row is unavailable and must not be assumed empty. Preserve existing text unless its replacement or removal is within the user's request.

Preview `set_clip_comment` with the exact observed `expectedComment` and requested `comment`, then apply its token within the authorized scope. The qualified write accepts at most 1,024 printable ASCII characters; do not silently transliterate, truncate or remove line breaks from unsupported text. An empty comment explicitly clears the field. Check `commentVerified` and independently reread `clip_columns`; an uncertain result requires inspection before any retry. Do not turn timestamped notes into whole-clip comments unless that is what the user requested.

For saved review evidence, use `avid_snapshot_saved_bins`, `avid_saved_snapshot_mobs` and `avid_diff_saved_snapshots`. `commentStatus: not_recorded` means historical capture lacked this field; `absent` means the attribute was absent; `recorded` includes an explicit empty string. Snapshot differences can reflect newly recorded fields rather than an edit. Native comment readback and saved comment evidence are separate; a successful write alone does not establish persistence. Never save or close unrelated bins merely to obtain evidence.

Return verified changes and any unresolved notes. Saved-bin persistence needs a separate save/reopen check; an in-memory read proves only the current host state.
