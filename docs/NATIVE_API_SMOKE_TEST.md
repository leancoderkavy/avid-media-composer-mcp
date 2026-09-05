# Native API real-host smoke test

> Historical 2026-09-04 evidence below. The 2026-09-05 implementation and host tests are recorded in [implementation status](IMPLEMENTATION_STATUS.md). Closing Test during that later session saved the original empty bin and changed its hash; the earlier unchanged-hash claim applies only to this earlier smoke-test window.

Tested 2026-09-04 on the installed Windows Media Composer Ultimate 2024.12 Trial,
application version `2024.12.58720`, reported SDK `PanelSDK_24.10`.

## Outcome

**16 distinct native API methods completed successfully against the real editor.**
The test created a disposable bin, linked synthetic audio, added and edited a marker,
verified persistence after closing/reopening the bin, and removed the test marker.
No SDK credentials, gateway configuration changes, or installed extension were used.

The original `Test Bin.avb` is byte-for-byte unchanged from the captured baseline
(SHA-256 `da002448c94bb87d1512c92fe4c4c5db0179a8ae16f13e7f00e41b97754427ce`).
Production MCP runtime code and capability declarations remain unchanged. This is
evidence for an independent native adapter, not a production MCP conformance result.

## Tested operations

| Native method(s) | Result and verification |
| --- | --- |
| `GetAppInfo`, `GetOpenProjectInfo`, `GetBins` | Read the expected app/build and `Test` project; observed the bin list update after creation. |
| `GetBinInfo` | Read bin size and open state; open state changed correctly after close/reopen. |
| `CreateBin` | Created `MCP_Smoke_20260904_232443_c9a8b2.avb`; verified through API enumeration, filesystem, and Avid UI. |
| `CloseBin`, `OpenBin` | Completed three close/reopen cycles. Saved file persisted; clip/marker state was read again after reopening. |
| `GetListOfLinkSettings` | Settings enumeration completed. The link experiment used the default setting. |
| `LinkFile` | Linked a generated five-second, mono, 48 kHz, 16-bit silent WAV into the disposable bin. Returned a clip ID; UI showed the clip and `5:00` duration. |
| `GetListOfBinItems`, `GetMobInfo` | Returned the fixture clip and expected name, A1 track, duration, timecodes, sample rate, and bit depth. |
| `AddMarker`, `GetMarkers` | Added/read a green marker on A1 at frame offset 30, timecode `00:00:01:00`, with the test comment. A green marker was visible in the source viewer. |
| `LoadMobsIntoViewer` | Loaded only the fixture clip into the Source viewer; visible clip title and duration matched. Playback was not exercised. |
| `ChangeMarker` | Changed the test comment and marker color to blue. API readback matched, and the visible marker changed to blue. |
| `DeleteMarkers` | Removed only the GUID returned by this test's `AddMarker`. Marker enumeration returned zero both immediately and after another close/reopen. |

All successful calls had gRPC status 0 and a completed application response.
The synthetic clip and edited blue marker survived a bin close/reopen before the
marker was removed. Marker removal also survived its own close/reopen cycle.
This did not restart the application or test persistence across an OS restart.

Independent offline parsing of the saved AVB with the repository's installed
`pyavb` found the master clip with one sound track of length 150 edit units, plus
its two supporting source mobs. This confirms that the linked clip was saved in
the bin file rather than existing only in a live response.

## Request details learned from failures

1. `CreateBin` with the absolute project path in `folder_path` failed with gRPC
   status 2. No bin appeared in UI, API enumeration, or the filesystem. The first
   transport helper omitted the error message, so the exact server explanation
   was not retained. After verifying absence, a request using `folder_path: ""`
   for the current project root succeeded. Other folder forms remain unqualified.
2. `GetBinInfo` for the absent fixture returned gRPC status 2 with native
   `ErrorType: 69` and a bin-not-found message. HTTP 200 alone was not success.
3. `AddMarker` with omitted `length` failed with native `ErrorType: 66`,
   `Incorrect marker length.` Marker enumeration remained empty. The corrected
   request with `length: 1` succeeded.

The research transport now retains bounded, decoded gRPC error text. Failure
receipts are recorded, and a mutation stage cannot be replayed automatically.
Do not treat transport errors as proof that no mutation happened: inspect the
target state before any deliberate follow-up experiment.

## Retained artifacts and cleanup

- Disposable bin: `MCP_Smoke_20260904_232443_c9a8b2.avb` in the open Test project.
  Final saved size: 23,889 bytes; it contains the linked audio fixture and no markers.
- Synthetic media: `.avid-mcp-analysis/native-host-smoke-20260904/MCP_SMOKE_SILENCE.wav`
  (480,044 bytes). Keep this file while inspecting the linked clip.
- Local JSON evidence: `summary.json`, `rpc-receipts.jsonl`, `fixture.json`, and
  `offline-bin-verification.json` in that same ignored analysis directory.
  Raw local receipts contain fixture paths and generated IDs; they are not release artifacts.
- The test bin was left open for inspection. No source bin or media was deleted.

UI evidence covers bin creation, bin closure, linked clip, viewer loading, and the
green-to-blue marker change. Final marker removal/persistence was verified through
fresh API reads. An unrelated Windows permission dialog obscured the final capture
and was left untouched.

## Repeatability and code validation

The staged [host smoke harness](../scripts/research/native_host_smoke.py) is separate
from the fixed three-method [read-only probe](../scripts/research/inspect_mcapi.py).
It checks the exact executable hash and listener owner, requires the observed Test
project, checks fixture paths and clip/marker ownership, and records stage attempts
before writes. It has no generic RPC CLI and accepts no credentials.

Use a fresh evidence directory under `.avid-mcp-analysis`. Run stages separately
and inspect each outcome before continuing:

```powershell
python scripts/research/native_host_smoke.py baseline .avid-mcp-analysis/<new-run>
python scripts/research/native_host_smoke.py create-project-root .avid-mcp-analysis/<new-run>
# Then: close, reopen, link, inspect-clip, add-point-marker, inspect-clip,
# show-clip, change-marker, persist-close, persist-reopen, inspect-clip,
# remove-marker, cleanup-close, cleanup-reopen, inspect-clip.
```

The `create` and `add-marker` stages retain the initially unsuccessful request
forms for explicit diagnostic reproduction. Normal successful reproduction uses
`create-project-root` and `add-point-marker` as shown above.

**14 offline research tests pass.** They cover malformed/ambiguous descriptors,
gRPC framing and error detail, read-only allowlist rejection, project switches,
fixture path escapes, duplicate stage attempts, existing-bin protection, and
unexpected extra clips before marker writes.

```powershell
python -m unittest discover -s scripts/research -p 'test_*.py' -v
```

The full production MCP suite was not rerun for these isolated research scripts.
Timeline edits, sequence creation, subclips, export, rendering, shared storage,
locked-user bins, cancellation, concurrency, and other host versions remain untested.
