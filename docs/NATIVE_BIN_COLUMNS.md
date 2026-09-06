# Native bin column discovery

Call `avid_native_read` with `query: "bin_columns"` and the target `bin` to inspect live column declarations on the qualified Windows Media Composer 2024.12 build. This adds `GetBinColumnInfo` to the native allowlist (14 reads and 15 writes). No new write action is added.

The query requires inspection authority and a bin resolved within the current authorized project. It returns `bin`, `columns` and a scope statement. Each column retains Avid's `column_name`, `column_value_type`, `column_hidden`, `column_is_custom` and `column_is_readonly`. Names preserve whitespace: the observed bin includes a three-space name used by a non-text column. Value types are declarations such as String, Popup, Timecode and Undefined; they are not validation schemas for arbitrary writes.

Responses are bounded to 512 total columns, 1,024 characters per name and 256 per type. Duplicate names and malformed flags are rejected; unrelated response fields are stripped. Project and resolved bin path are checked again after reading. These checks are not an atomic session snapshot. The native decoder materializes protobuf defaults, including false flags, so a writable declaration does not prove that a specific edit will be accepted. Only separately implemented and qualified connector actions may perform writes.

Actual inspection of `MCP_Color_ac0a950e18ee.avb` returned 179 columns and one custom column, Comments. Name was declared non-read-only; the whitespace column was read-only. Inspect-only MCP results matched direct native calls before and after, and the saved bin hash stayed unchanged. Evidence: `.avid-mcp-analysis/native-bin-columns-90a1ccb2-9907-48df-9d6d-8f46b6e7189c/evidence.json`. Research command: `node scripts/research/qualify-native-bin-columns.mjs` (fixed disposable fixture).

This does not verify visible column layout, values for every clip, custom-column creation, arbitrary metadata edits, version portability or undo.
