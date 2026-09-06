# Watch folder relocation

## Polling failure isolation

Polling continues through each enabled watch when another watch throws during scanning. Unavailable list records and scan failures appear in `avid_watch_service` status as `watchErrors` with a watch ID and an error capped at 1,024 characters. The list is bounded by the existing 100-watch limit. `lastError` summarizes a completed cycle's failures; a subsequent healthy cycle clears both fields. Status retains the last completed cycle while another cycle runs; list-wide failures set `lastError` and preserve prior per-watch diagnostics. Polling stays serial and overlapping timer ticks are skipped. Per-file indexing errors remain in scan results and watch observations.

Actual MCP timer qualification configured two watches over an owned Sonoma copy, held the first watch's fixture lock and verified the second indexed after stable observations. The lock remained unchanged. Explicit removal of that owned lock allowed the first watch to index, and diagnostics cleared. Original/copy hashes were unchanged and polling was stopped. Evidence: `.avid-mcp-analysis/watch-isolation-84c336d6-641c-4b32-8d52-8cca5b259b3c/evidence.json`. Regression tests also cover unavailable-record diagnostics, message bounds and overlap prevention. This does not remove stale locks automatically or prove general concurrent filesystem recovery.

New watch records retain a fingerprint of their configured allowed-root set. If their old folder becomes unavailable, `avid_configure_watch_folder` can replace the same `watchId` with a new accessible folder inside that unchanged scope. The replacement resets observations: the first scan records stability and the next matching scan may index. No folder is automatically searched, moved or relinked.

`avid_remove_watch_folder` can also remove an unavailable new watch within its original scope. It removes the configuration only; source files and cached analysis remain. `avid_list_watch_folders` continues to report the old folder as unavailable until replacement/removal. Scanning still requires an accessible, currently allowed folder.

The exception applies only to an unavailable folder, a matching stored scope, and a configuration mutation already requiring project-write. Existing folders outside current allowed roots remain refused. Changed scope fingerprints and legacy records without a scope do not bypass old-folder checks. This fingerprint is record metadata, not an authentication credential. Locks remain authoritative; this feature never removes stale watch locks.

Actual MCP qualification used an owned copy of the Sonoma MP4. After indexing, the harness moved only its test folder, reconnected, observed unavailability, explicitly replaced the watch, and performed two fresh scans. The checksum-backed media alias resolved to the new path. A second owned-folder move tested removing the unavailable watch; the media copy remained intact. Original and copied MP4 hashes were unchanged. Evidence: `.avid-mcp-analysis/watch-relocation-a9b9b8d2-4be2-45ed-8a80-3d7b86b71d5a/evidence.json`.

This qualifies same-scope configuration recovery on the current Windows host. It does not establish shared-storage lock recovery, changed-scope migration, offline-drive mounting, automatic relink or every filesystem failure mode.
