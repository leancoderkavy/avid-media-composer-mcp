# SDK-independent local API investigation

Observed 2026-09-04 on Windows with Media Composer Ultimate 2024.12 Trial.

**Follow-up testing:** 16 native methods now have successful real-host smoke evidence,
including bin creation, media linking, and marker add/change/remove with bin
close/reopen checks. See [NATIVE_API_SMOKE_TEST.md](NATIVE_API_SMOKE_TEST.md).
The original discovery observations below describe the earlier read-only phase.

## Result

The installed editor exposes a working local gRPC service. Three read-only methods
completed successfully without an SDK download, extension installation, supplied
company ID, or supplied access token. This establishes an independent route for
further MCP development. It does not establish write support or compatibility with
another Media Composer build.

| Read-only call | Observed result |
| --- | --- |
| `GetAppInfo` | `Ultimate`, application version `2024.12.58720`, SDK version `PanelSDK_24.10` |
| `GetOpenProjectInfo` | Open project `Test`, `30i NTSC`, rate `30000/1001` |
| `GetBins` | `Test Bin.avb`, with explicit request flag `AllTypes` |

The initial read-only calls returned HTTP 200, gRPC status 0, and application status `Completed`.
The project and bin names agree with the earlier computer-use inspection. No
editor content was changed during that initial phase. These reads were exercised by a research utility,
not through the production MCP server.

## Installed interface metadata

Read-only parsing located serialized protobuf file descriptors in
`C:\Program Files\Avid\Avid Media Composer\AvidMediaComposer.exe`:

| Descriptor | File offset | Serialized bytes | Contents |
| --- | ---: | ---: | --- |
| `MCAPI.proto` | 67,769,184 | 5,684 | Service `mcapi.MCAPI`, 49 methods, custom method option `mcapi.api_scope` |
| `MCAPI_Types.proto` | 67,787,024 | 25,675 | 208 top-level message definitions |

The executable is 80,286,232 bytes, file version `24.12.0.58720`, SHA-256
`3ca4d082a3afe00a120d6061d6ee94e20e6113238f0b016398700f3439ec9194`.
Offsets and signatures are evidence for this binary, not a universal layout. The
research script locates descriptors by their encoded names and validates them;
it does not hard-code these offsets.

Descriptor options assign 44 methods to `avid.mediacomposer.general`, four to
`avid.mediacomposer.SRT`, and `GetMobTrackInfo` to
`avid.mediacomposer.timelineEditing`. These strings are declarations, not proof
of permissions or functionality.

Selected methods present in this installation:

| Group | Methods present in descriptor metadata | Execution evidence |
| --- | --- | --- |
| App/project/bin reads | `GetAppInfo`, `GetOpenProjectInfo`, `GetBins` | Completed on this workstation |
| Other inspection | `GetBinInfo`, `GetBinColumnInfo`, `GetMobInfo`, `GetMobTrackInfo`, `GetListOfBinItems`, `GetViewerMobs`, `GetMarkers`, `GetMediaVolumeList` | Not called |
| Bins and clips | `CreateBin`, `OpenBin`, `CloseBin`, `CreateSubClip`, `MoveBinItems`, `CopyBinItems`, `DuplicateBinItems` | Not called |
| Interchange | `ImportFile`, `LinkFile`, `ExportFile`, `ExportEDL`, associated settings-list methods | Not called |
| Metadata and markers | `SetMobInfo`, `CreateCustomColumn`, `AddMarker`, `AddMarkers`, `ChangeMarker`, `DeleteMarkers` | Not called |
| Viewer/selection | `LoadMobsIntoViewer`, `SelectMobsInBin` | Not called |

No dedicated sequence-creation, timeline-insertion, OTIO, or transcript RPC appeared
in this extracted 49-method service. That is a finding about this service on
2024.12, not proof that no alternate surface exists. The 2026.8 feature announcement
must not be applied to the installed 2024.12 API.

## Transport and request details

Windows confirmed that `AvidMediaComposer.exe` owns `127.0.0.1:9100`. A bounded
HTTP/2 gRPC reflection request listed `mcapi.MCAPI` and
`grpc.reflection.v1alpha.ServerReflection`, with gRPC status 0. Reflection is a
standard metadata service, documented by the [gRPC project](https://grpc.io/docs/guides/reflection/).
The discovery request used the public [v1alpha protocol](https://github.com/grpc/grpc-proto/blob/master/grpc/reflection/v1alpha/reflection.proto).

Native method routes follow `/mcapi.MCAPI/<MethodName>`. Request messages have a
header and a body. The header declares `company_id` and `access_token`; both were
omitted in the successful reads. This observation does not establish an
authentication contract for other calls or builds. No credentials were retrieved,
generated, or substituted, and no gateway/security configuration was changed.
No request was sent to gateway ports 4920 or 4930.

Two behavior details affect an adapter:

- HTTP/gRPC success is insufficient: inspect the application response header,
  completion status, and error field. Some methods are server streams.
- `GetBins` with no request flags completed but returned no bin entries on this
  project. Supplying the repeated enum value `AllTypes` returned `Test Bin.avb`.
  An empty result from the first request must not be interpreted as an empty project.

The project response also reported raster `720 x 496` and color space `Unknown`.
These values are recorded exactly as returned. Their semantics have not been
reconciled with UI settings; do not silently normalize them into a format specification.

## Reproduce locally

The standalone [research utility](../scripts/research/inspect_mcapi.py) requires
Python with `protobuf`; live reads additionally require `h2`. Versions exercised
here are recorded in [research requirements](../scripts/research/requirements.txt).
These packages were already installed on the investigated machine. They are
separate from the production Python analyzer requirements.

Static inspection, which opens no network connection:

```powershell
python scripts/research/inspect_mcapi.py 'C:\Program Files\Avid\Avid Media Composer\AvidMediaComposer.exe'
```

To repeat the three reads, open a disposable project in Media Composer and add
`--probe-read-only`. Optionally add `--output <new-report.json>` to create a report;
the destination directory must exist and the script refuses to overwrite a file.

The probe checks the listening process against the inspected executable, connects
only to IPv4 loopback port 9100, has a fixed four-method read allowlist (the original three plus opt-in media volumes), and enforces
response-size and time bounds. It stops on rejected calls or application errors.
It does not expose a generic RPC command or accept credentials. Full project/bin
paths and task IDs are excluded from its JSON report; project/bin names remain.
Descriptor bytes, vendor binaries, and vendor packages are not copied into the repo.

Validation performed:

- Eight offline tests passed for descriptor discovery, ambiguous/malformed inputs,
  gRPC frame bounds, and rejection of write/arbitrary RPC names before connection.
- The final research script completed all three read-only calls against the real host.
- Production runtime code and its existing capability declarations are unchanged;
  the production MCP suite was not rerun for this isolated research addition.

Run the offline tests with:

```powershell
python -m unittest discover -s scripts/research -p test_inspect_mcapi.py -v
```

## Development path

1. Implement a separate opt-in local native adapter for the three demonstrated reads.
   Give it its own transport identity and exact-build qualification. It must not
   impersonate the existing authenticated Extension mailbox bridge.
2. Qualify reads with closed projects, unsaved/locked bins, busy/modal UI, timeouts,
   streaming partial results, and host restarts. Determine stable IDs and response
   semantics before exposing a general live-state model.
3. Inspect additional request/response definitions from the installed binary and
   qualify one reversible write on synthetic fixtures. Compare before/after state,
   save/reopen persistence, and undo/recovery. Keep untested methods unavailable.
4. Use generated AAF/ALE/EDL artifacts for operations absent from this service. The
   installed host supports OTIO export; documented OTIO import starts at 2025.6.
5. Treat a later SDK grant as optional documentation and support input. SDK access
   is no longer a prerequisite for investigating or implementing the independent
   local adapter.

The existing Extension bridge validation document assumes a sanctioned SDK adapter.
A native-adapter implementation needs an explicit companion contract and evidence
matrix; this research does not change that existing contract by implication.
