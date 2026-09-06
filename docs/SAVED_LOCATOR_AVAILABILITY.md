# Saved locator availability

`avid_saved_locator_availability` checks file metadata for locator declarations in a saved-bin snapshot. It complements source-ID tracing: a resolved MOB reference does not establish media availability, and a missing reference does not prove a file is offline.

Capture with `avid_snapshot_saved_bins`, then provide `revision`, `after` (default -1), and `limit` (1–50). Follow `nextAfter` until null. Each result retains its snapshot index, bin, MOB, locator field and raw declaration. Pages include snapshot coverage/warnings and a new observation timestamp. Counts describe declarations, including duplicate path fields and absent descriptor rows, not unique media assets.

Each row also includes `binPresent` and the captured `binSha256`; every page includes `missingBins`, `snapshotCreatedAt` and `binHashesRevalidated: false`. Missing-bin evidence remains visible even on empty pages. A present bin may have changed since capture: its presence does not validate its current bytes against the captured hash. Capture a new snapshot when current saved contents are required.

Supported direct paths are host-native absolute paths inside configured roots. Files receive `file_present` with byte size and modification time; no media content is read or hashed. Other outcomes include `not_found`, `not_a_file`, `outside_allowed_roots`, `access_denied`, `unavailable`, `unsupported_path`, `symlink_refused`, `volume_hint`, `descriptor_not_recorded`, `descriptor_absent` and `locator_absent`. An unavailable root is not classified as a missing file. Intermediate locator symlinks/junctions are refused. There is no basename search, volume mount, file URI decoding, relink or media mutation.

## Observed Windows Avid path spelling

Some qualified Windows fixture locators spell drive paths as `D//folder/file.mov`. The default probe leaves that unsupported. Set `interpretAvidDrivePaths: true` explicitly to interpret a single ASCII drive letter followed by two forward slashes as `D:/folder/file.mov` on Windows. The raw value stays intact; the result adds `interpretation: avid_drive_double_slash` and `interpretedPath`. Scope checks still apply. This option does not map foreign volumes, network/UNC paths, relative paths, alternate data streams or unknown locator encodings.

The spelling was already present in retained descriptor/media comparisons for the separately named Sonoma MP4. This workflow also checked it against the explicitly named prepared MOV used by the saved fixture. It is a bounded interpretation of observed fixtures, not a general Avid locator specification.

## Evidence and limits

The real `MCP_Load_7006b4d8.avb` experiment produced eight declaration rows: two absent descriptors, two `D//.../prepared.mov` paths and four volume hints. Default checks retained two unsupported paths. Explicit interpretation found the two path declarations referring to the configured prepared MOV, reporting 167,695,341 bytes. Pagination continued through a fresh MCP connection. Bin, original MP4 and prepared MOV hashes remained unchanged. Evidence: `.avid-mcp-analysis/locator-availability-620ad702-428c-4400-8aff-feb8ed782592/evidence.json`, from `scripts/research/qualify-locator-availability.mjs`.

Unit tests cover native/missing/directory paths, outside-root refusal, foreign/relative/network declarations, directory junctions, opt-in drive spelling, paging, reconnect and incomplete snapshot coverage. `file_present` does not verify content identity, codec/range correspondence, Avid online state, relink success or playback. Saved declarations can be stale; filesystem checks are non-atomic, may change between pages, and are not protection against malicious concurrent filesystem replacement. Broader managed-MXF lookup and shared-storage/mapping qualification remain open.

## Missing file and unavailable-root recovery

`scripts/research/qualify-locator-recovery.mjs` creates an owned MP4 copy and a copied AVB whose two path fields deliberately point to that copy. The real Python/MCP snapshot parser captures this edited fixture; it is not imported into Avid and does not claim matching essence or an editor relink.

Using one unchanged snapshot revision, the experiment checks presence, moves only the owned media file aside, reconnects and observes `not_found`, then restores it and observes `file_present`. It separately moves the owned configured media root aside, reconnects and observes `unavailable`, then restores the root and observes `file_present`. It verifies every move remains inside its experiment directory and restores moved fixtures in `finally` on failure. Original AVB/MP4 hashes and the restored fixture hashes remain unchanged.

Evidence: `.avid-mcp-analysis/locator-recovery-f743beda-7412-43a2-ac44-c3119b1af4a3/evidence.json`, including the five individual observation files. This establishes current filesystem observation across reconnect and the missing-file/unavailable-root distinction. It does not qualify disconnected network shares, managed-MXF lookup, native online state or content identity.

The extended experiment also moves only the copied AVB aside, reconnects and continues to read its historical locator declarations while every row says `binPresent: false`. An empty page still identifies the missing bin. Restoring the copied bin returns present status without changing the snapshot revision or claiming hash revalidation. Original and restored fixture hashes remain unchanged. Evidence: `.avid-mcp-analysis/locator-recovery-a58ec915-2da5-4619-ae99-c831d21346fa/evidence.json`. A regression separately replaces an owned test bin with different bytes and verifies that the response still labels its hash as historical rather than current.
