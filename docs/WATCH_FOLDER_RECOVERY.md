# Watch folder relocation

New watch records retain a fingerprint of their configured allowed-root set. If their old folder becomes unavailable, `avid_configure_watch_folder` can replace the same `watchId` with a new accessible folder inside that unchanged scope. The replacement resets observations: the first scan records stability and the next matching scan may index. No folder is automatically searched, moved or relinked.

`avid_remove_watch_folder` can also remove an unavailable new watch within its original scope. It removes the configuration only; source files and cached analysis remain. `avid_list_watch_folders` continues to report the old folder as unavailable until replacement/removal. Scanning still requires an accessible, currently allowed folder.

The exception applies only to an unavailable folder, a matching stored scope, and a configuration mutation already requiring project-write. Existing folders outside current allowed roots remain refused. Changed scope fingerprints and legacy records without a scope do not bypass old-folder checks. This fingerprint is record metadata, not an authentication credential. Locks remain authoritative; this feature never removes stale watch locks.

Actual MCP qualification used an owned copy of the Sonoma MP4. After indexing, the harness moved only its test folder, reconnected, observed unavailability, explicitly replaced the watch, and performed two fresh scans. The checksum-backed media alias resolved to the new path. A second owned-folder move tested removing the unavailable watch; the media copy remained intact. Original and copied MP4 hashes were unchanged. Evidence: `.avid-mcp-analysis/watch-relocation-a9b9b8d2-4be2-45ed-8a80-3d7b86b71d5a/evidence.json`.

This qualifies same-scope configuration recovery on the current Windows host. It does not establish shared-storage lock recovery, changed-scope migration, offline-drive mounting, automatic relink or every filesystem failure mode.
