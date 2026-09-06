# Media Composer interoperability investigation

Checked 2026-09-04 against local main `36eba17` and public primary sources.

## Findings

- The checkout already implements offline AVB/AAF/ALE/EDL/OTIO inspection and a guarded file-mailbox bridge. Its 167-action catalog is a proposed interface, not implemented host coverage.
- After the initial check, the user installed Media Composer. Computer-use inspection now confirms Ultimate 2024.12 running with a Trial license and an empty Test project. Executable build: `24.12.0.58720`. The bundled gateway and Huddle panel were inspected read-only; see [the workstation and resource inventory](DEVELOPER_RESOURCE_INVENTORY.md).
- Avid's 2026.8 announcement explicitly describes sequence creation, OTIO import/export, and transcription read/write API/SDK enhancements. It does not supply method signatures or establish that this MCP supports them.
- The public Extensions onboarding page still says new partners are not actively being onboarded.
- The user confirmed Avid will not provide SDK access. Subsequent SDK-independent investigation recovered 49 RPC definitions and 208 message types from the installed executable. The native service completed real app, project, and bin reads; see [NATIVE_API_RESEARCH.md](NATIVE_API_RESEARCH.md).
- Follow-up real-host smoke testing exercised 16 methods successfully, including disposable-bin creation, synthetic audio linking, and marker add/change/remove with close/reopen persistence checks. The original bin hash remained unchanged. See [NATIVE_API_SMOKE_TEST.md](NATIVE_API_SMOKE_TEST.md).
- pyavb provides independent AVB reading and writing. This repository deliberately uses offline analysis as read-only; enabling writes would need a separate experimental output path and host round-trip validation.

## Investigation sequence

The [2026-09-05 competitor review](COMPETITOR_RESEARCH.md) adds a feature inventory, source/license references, staged delivery changes and Sonoma MP4 acceptance tests. Windows delivery comes first; Mac implementation and qualification follow on a Mac. Jumper is a documented commercial competitor and an optional future search provider, not a required dependency.

1. Initial host/component inventory and native read-only discovery are complete. Continue from the exact installed build and observed API behavior in [NATIVE_API_RESEARCH.md](NATIVE_API_RESEARCH.md). Implement a separate opt-in native adapter for the three demonstrated reads. No complete Extensions SDK or authenticated Extension-mailbox connection has been established.
2. Prepare a disposable project with synthetic media. Save an untouched baseline, then perform exactly one operation per copy: rename clip, add marker, create subclip, create sequence, insert clip, trim, and change track assignment.
3. Compare decoded AVB object graphs and exported AAF/ALE/OTIO before and after each operation. Track stable mob IDs, edit rates, source offsets, durations, marker coordinates, and references. Separate volatile save metadata from semantic changes. Preserve unknown fields and retain fixtures for unsupported structures.
4. Turn observed relationships into parser regression fixtures. Validate mixed frame rates, drop-frame timecode, offline media, effects, transitions, nested sequences, and locked bins. Binary differences alone are hypotheses until repeated controlled experiments confirm them.
5. Build a separate interchange-output experiment: generate a new AAF artifact outside the source project, import it into a disposable bin, then export and compare its timeline semantics. This 2024.12 host documents OTIO export only; OTIO import experiments require 2025.6 or later. Import success alone is insufficient; verify timing, relinks, transitions, effects, audio routing, and save/reopen persistence.
6. Map one observed native method at a time into the separate native adapter. Start with the demonstrated project/bin reads, then qualify additional reads and one reversible edit on disposable fixtures. Do not assume sequence creation, OTIO, or transcript APIs exist on this build. Advertise only verified operations. SDK access is optional future input, not a prerequisite.

## First useful deliverable

A reproducible native read-only probe is now implemented in [scripts/research/inspect_mcapi.py](../scripts/research/inspect_mcapi.py) and exercised against the installed host. The next delivery is an opt-in MCP adapter for those reads, followed by a fixture comparison harness and conservative interchange generation. Existing analyzers should be reused rather than replaced with a new proprietary-format parser.

The native research route works without the SDK download. Live editing still needs per-operation host validation and a separate adapter contract. [REAL_HOST_VALIDATION.md](REAL_HOST_VALIDATION.md) currently describes the sanctioned Extension bridge; native-adapter evidence must be defined explicitly rather than silently substituted for that contract.

## Sources checked

- [Media Composer 2026.8 announcement](https://www.avid.com/resource-center/whats-new-avid-media-composer-2026-8)
- [Extensions overview](https://connect.avid.com/media_composer_extensions.html)
- [Extensions onboarding status](https://connect.avid.com/23-q4-global-mc-panel-sdk-lp.html)
- [Avid developer integration families](https://developer.avid.com/)
- [pyavb source and capabilities](https://github.com/markreidvfx/pyavb)

This investigation inspected repository code, public documentation, the editor's UI, executable metadata and embedded protobuf descriptors, local listeners, and the bundled panel manifest. Initial service discovery and three native reads were followed by a 16-method real-host smoke test with disposable-bin, media-linking, and marker writes. Fourteen research tests pass. The existing production MCP test suite was not rerun, and production runtime capabilities are unchanged.
