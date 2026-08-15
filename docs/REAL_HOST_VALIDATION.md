# Real Media Composer validation protocol

Simulated mailbox responses prove the MCP contract, not Media Composer behavior. An edit operation
may be advertised as `host-verified` only after this protocol succeeds on a qualified workstation.

## Evidence levels

| Level | Meaning |
| --- | --- |
| Cataloged | The operation has a schema and risk classification. |
| Protocol-tested | The MCP and a simulated bridge exchange valid messages. |
| Extension-implemented | A sanctioned Media Composer Extension maps the operation to a documented SDK method. |
| Host-observed | Media Composer visibly changed after the request. |
| Host-verified | A fresh state read and save/reopen check confirm the intended result. |

Only the final level permits a release to describe an operation as supported live editing.

## Required test matrix

Record the exact Media Composer patch, Extension version, bridge protocol version, operating-system
build, architecture, storage type, and project fixture commit for every run. At minimum, qualify:

- the current Media Composer release on a qualified Windows workstation;
- the current release on a qualified macOS workstation;
- the previous supported Media Composer release on at least one platform;
- local storage plus the shared-storage workflow available to the test facility;
- small, large, locked, partially offline, and mixed-frame-rate projects.

Do not infer one platform or release from another.

## Per-operation procedure

1. Clone a disposable project fixture and verify its checksum.
2. Start Media Composer, the installed Extension, and the local MCP with the minimum authority.
3. Capture `avid_get_bridge_status` and `avid_get_live_state` before the operation.
4. Preview the exact edit plan and retain its risk report and confirmation hash.
5. Apply the unchanged plan once.
6. Capture the structured Extension response and visible host result.
7. Read live state again and compare stable project, sequence, bin, clip, track, and revision IDs.
8. Save, close, reopen, and verify persistence where the operation is expected to persist.
9. Exercise Media Composer undo or restore the disposable fixture and record the result.
10. Attach redacted logs and screenshots to the release evidence without customer paths or media.

Failures, timeouts, partial application, stale-state rejection, and unsupported-operation responses are
test outcomes and must be retained. A submitted request or successful preview is never completion.

## Release record

For each advertised operation, publish a row containing:

| Field | Required value |
| --- | --- |
| Operation | Exact catalog action name |
| SDK mapping | Documented SDK method and SDK version |
| Risk | Read-only, reversible, destructive, export, or external |
| Platforms | Exact qualified host combinations tested |
| Before/after | Redacted evidence references |
| Persistence | Save/reopen result |
| Recovery | Undo or restore result |
| Status | Unsupported, implemented, host-observed, or host-verified |

The connected Extension remains the runtime authority: it must advertise only operations verified for
its exact Extension, SDK, Media Composer, platform, and protocol combination.
