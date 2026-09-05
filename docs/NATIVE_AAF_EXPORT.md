# Native source-master AAF export

The unreleased Windows adapter supports `export_aaf_master` through `avid_native_preview` and `avid_native_apply`. This closes the reference-template step between a linked source clip and the existing AAF selects builder.

```json
{
  "operation": {
    "action": "export_aaf_master",
    "bin": "LinkedSources.avb",
    "mobId": "<native ID returned by avid_native_read>",
    "preset": "AAF",
    "sourceFile": "<absolute linked media path>",
    "expectedSourceSha256": "<current media checksum>"
  }
}
```

The operation requires export capability, the qualified native binary, a 30 fps project/source, permitted project/media roots, an existing output root and Python with pyaaf2. Preset names can be read with `avid_native_read` / `export_settings`; the preset must already exist in Avid. The adapter does not change preset contents.

Preview binds host identity, project, saved bin and live clip/marker metadata, preset names, source path/checksum and native frame count. It requires the master's `Source Path` plus `Source File` to resolve to the explicitly selected source. Apply consumes the token, rechecks state, acquires the native write lock, records an attempt in a unique directory, and exports `export/reference.aaf` once.

After output stability checks, the verifier checks the compound-file header and uses the shipped read-only AAF inspector. It requires a master-only AAF without embedded essence, one exported master, exactly one local media reference matching the selected source, and unique picture/sound slots at 30 fps with the native frame count. There must be at least one picture slot and at most 16 slots. AAF size is limited to 64 MiB. It then rechecks source/output hashes, file identity and host/project identity. The receipt retains the parsed master/slot IDs, checksums and source references.

Use `verification.inspection.template` and `verification.inspection.sha256` as the inputs to `avid_build_aaf_selects`, selecting the returned master/slot IDs. Inspect the new composition with `avid_inspect_aaf_selects` before native import. The exported master ID may differ from the native clip ID.

The receipt's `masterContractVerified` and `outputVerified` flags establish this structural/source contract. They do not establish all downstream descriptor semantics, decoding, general effects, source fidelity or successful reimport. Multiple-source templates, other rates, audio-only masters, embedded essence and sequence AAF exports are outside this action's current qualification.

Any post-dispatch failure retains a `NATIVE_EXPORT_UNCERTAIN` lock and identifies the output; the export is never automatically retried. Existing export-lock status/recovery recognizes the `reference.aaf` / `export_aaf_master` pair as well as MP4 exports, validates the matching attempt and project scope, and requires stopped Avid before releasing a reviewed lock. Recovery preserves output and does not resume the export.

## Qualification

`scripts/research/qualify-native-aaf-master-mcp.mjs` exports the linked Sonoma source-clock PCM master, refuses a wrong source checksum and token replay, and consumes the returned reference in the shipped selects builder. The resulting composition is re-inspected for three tracks and two cuts at source starts 2850/3300 with lengths 60. The script preserves the source and linked bin and does not perform a new native import.

Unit tests cover stable-file readiness, malformed headers, wrong master/media/rate/length/kind/slot evidence, changed source files, missing output, single dispatch and retained locks on uncertainty. A separate recovery test confirms that releasing a scoped reference-AAF export lock preserves its output.

Actual MCP evidence: `.avid-mcp-analysis/native-aaf-master-mcp-f6012198-7bad-489d-9d85-f4968f0fdcf9/evidence.json`. The exported master had one picture and two sound slots, each 5726 frames at 30 fps, referencing the checksum-selected PCM MOV. Its output is `native-export-b38de484-81d0-4bdf-82a5-902d55b122d0/export/reference.aaf`; the new selects are in `avid-mcp-library/aaf-cd8f6e6d-0202-4f80-bbc4-28827aa50c29/selects.aaf`. Actual export, builder consumption and structural reinspection passed, with source/bin hashes unchanged and the native lock released. Full local checks passed with 330 TypeScript tests, 18 Python tests, 125 tools, both transports and fresh installation.
