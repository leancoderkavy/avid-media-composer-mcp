# Native AAF selects import

The Windows native adapter supports `import_aaf_selects` through the existing `avid_native_preview` / `avid_native_apply` tools. It uses descriptors extracted locally from the checksum-qualified Media Composer 2024.12 binary. No private SDK is distributed.

First inspect the AAF with `avid_inspect_aaf_selects` and choose an existing, open, empty destination bin in the current allowed project. Use `avid_native_read` with `query: "import_settings"` to discover preset names. Then preview:

```json
{
  "operation": {
    "action": "import_aaf_selects",
    "bin": "EmptySelects.avb",
    "file": "<absolute selects AAF path>",
    "expectedSha256": "<checksum returned by inspection>",
    "preset": "Untitled"
  }
}
```

Apply the returned token once. Both edit and export capabilities are required: edit permits the native import, and export permits local inspection/attempt/receipt files. Creating a separate bin additionally requires project-write. Preview writes local inspection manifests but does not mutate Avid; its MCP annotations reflect that local side effect.

Preview binds the qualified host identity, project, saved-bin checksum, empty live bin contents, AAF structure/checksum, local media checksums, preset names and evidence output root. Apply consumes the five-minute token, obtains the per-user native lock, re-inspects and compares this state, records an attempt, and calls ImportFile once with `Import_StopIf_Media_No_in_DB`. Both the project and composition currently require 30 fps. The [AAF structural subset](AAF_SELECTS_INSPECTION.md) applies.

After a completed response, the adapter discovers the composition by its unique name in the destination bin and checks native name, frame count and FPS. It rechecks all inspected source hashes and host/project identity before writing a receipt. The receipt provides the native MOB ID, which may differ from the AAF ID. `hostMetadataVerified` and `sourceFilesUnchanged` describe those checks; `persistenceVerified` and `sourceFidelityVerified` remain false.

Save/reopen and saved source-graph checks are separate operations. Preset contents, downstream source-descriptor semantics, unsaved source graphs, effects, relinking, perceptual sync and rendering are not established by a successful import receipt. The process lock serializes cooperating MCP writers; it does not prevent an editor user or another application from changing the project during import. There is no atomic undo.

Any error after dispatch begins returns `NATIVE_IMPORT_UNCERTAIN`, including the attempt path, and retains `~/.avid-mcp/native-write.lock` with an `import-unresolved` record. Inspect the host and attempt before further editing. Tokens cannot be replayed, and imports are never automatically retried. Lock status reports such locks as ineligible for export recovery; `avid_recover_native_export_lock` cannot release them. Import-specific recovery is not yet implemented.

## Qualification

`scripts/research/qualify-native-aaf-import-mcp.mjs` exercises the real stdio tools against the disposable Sonoma project using a checksum-selected AAF. It creates a unique bin, rejects a wrong AAF checksum while the bin remains empty, imports once, refuses token replay and a second import into the occupied bin, then saves/reopens and inspects a saved snapshot. It preserves the original selects bin and input AAF. This script is fixture-specific and should not be used as an automatic retry after an uncertain operation.

Unit tests cover source/bin/owner changes between preview and apply; missing presets, incompatible project rates and capability failures; native metadata mismatch; and RPC/source-change uncertainty retaining the lock and consumed token.

Real-host evidence: `.avid-mcp-analysis/native-aaf-import-mcp-f4ee1204-197e-406e-a665-1984bf55e00a/evidence.json`. The new bin is `MCP_Import_3405029e.avb`; save/reopen retained native composition `060a2b340101010501010f1013-000000-aa4d1d5e12888806-f9bad8bbc16d-18d9`. Saved-bin SHA-256: `176521fb8ef00b756f75dcafd2c6be66a64065ef72adb1f36665d9baf1ffaa9f`. A separate actual MCP saved-range check recovered both video cuts and both stereo channel references at 2850/3300 with lengths 60, preserving the saved bin (`ranges-4845b560-ea2b-424a-b588-4931b4249684.json` in that evidence directory).

A subsequent MCP export of this imported sequence passed 120-frame full decode, zero video/audio start declarations, limited-range BT.709 tags and replay refusal: `.avid-mcp-analysis/native-render-mcp-a50e945b-8be7-4294-86ab-c5723868293f/`. Its complete 24-bit stereo PCM exactly matches the original source-clock cuts; channels remain distinct. All video frames match the earlier PCM fixture's decoded checksum, and source presentation-time correspondence remains within 0.334 microseconds. The known native range-tag/pixel interpretation discrepancy remains unchanged (mean diagnostic RGB RMSE 10.9395); import success does not resolve color fidelity. Audio and frame evidence are beneath `native-export-53c32d81-0635-4f44-94dd-213a4065f075/export/` in that directory.
