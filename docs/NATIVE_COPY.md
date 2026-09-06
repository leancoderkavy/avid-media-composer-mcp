# Copy a bin item through MCP

The development Windows native adapter supports `copy_clip` through `avid_native_preview` and `avid_native_apply`. Configure the qualified host with `inspect,edit` and authorized project roots as described in [local setup](LOCAL_SETUP.md).

Read source members with `avid_native_read` (`query: "clips"`). Use an existing empty destination bin in the same project. Creating a new bin is a separate `create_bin` operation requiring `project-write`.

```json
{
  "operation": {
    "action": "copy_clip",
    "bin": "Source.avb",
    "mobId": "SOURCE_MOB_ID",
    "destinationBin": "Results.avb"
  }
}
```

Review the preview, then pass its token to `avid_native_apply`. The token is single-use and expires after five minutes. Observed changes to source/destination state invalidate it. The source item must belong to the source bin, and the destination must remain empty.

Avid creates a new identity for the qualified sequence copy, while the qualified master copy retains its source identity. Use the returned destination MOB ID; do not assume the source ID or infer identity from the generated name. `copyIdentityVerified:true` means the destination's sole member matches the returned ID and the source membership was unchanged. It does not mean media files were duplicated or that every source property was preserved.

`persistenceVerified` and `sourceFidelityVerified` remain false in the copy receipt. Save/reopen and saved timeline comparison are separate operations. On the Sonoma sequence fixture, separate close/open MCP operations retained the copied identity and the decoded saved timeline matched the original, including four reachable source nodes. Both graphs retained one unresolved source reference. Other clip types beyond this sequence/master fixture, effects, shared bins, media-copy behavior and playback fidelity require additional qualification.

After a lost response or mismatch, inspect both bins before creating another plan. Do not automatically retry. A populated destination is refused on a new preview even when the earlier response was lost. No automatic undo or deletion is performed.

## Copy several results

Use `copy_clips` with a nonempty, unique `mobIds` array instead of `copy_clip` and `mobId`. The same empty-destination, authorization and preview-state requirements apply. Up to 4096 IDs are accepted by the schema; live batch qualification currently covers the two-item Sonoma master/sequence fixture, not a large-batch throughput guarantee.

Verification requires the complete returned identity set to equal destination membership and have the requested count. It rejects duplicate, missing or extra IDs. Response order is not a source-to-copy mapping: the qualified master retained its ID while the sequence received a new ID, and destination enumeration used a different order. No automatic retry follows partial results or a lost response. Inspect both bins before deciding the next operation.

The two-item MCP batch also survived a separate close/open cycle with both identities retained. Saved decoded sequence fields and reachable source nodes matched the original; the same unresolved source reference remained. These fixture results do not change the per-copy receipt: persistence and source fidelity still require separate verification.
