# Media Composer MCP landscape and plan additions

Checked 2026-09-05. This is public documentation and static source research, not a runtime benchmark. No competitor was installed, run against Sonoma footage, or given credentials. Selected source snapshots are in the ignored `.avid-mcp-analysis/competitors-20260905` folder; no third-party implementation has been incorporated into this project.

## Result

**Jumper is a direct commercial competitor with documented Media Composer MCP workflows.** Its September 3 documentation explicitly describes reading Avid timelines and sending edited timelines back. The earlier August research conclusion is now incomplete.

Searches of the public web, GitHub results, and npm's Avid listing did not identify a second independent, dedicated open-source Media Composer editor MCP beyond our own repository. This is a scoped search result, not proof none exists. Our `leancoderkavy/avid-media-composer-mcp` listing and mirrors were excluded as competitors. MediaCentral, Pro Tools, planned Avid support, and incidental mentions of Avid were classified separately.

| Project | Relationship | Evidence inspected | Reuse position |
| --- | --- | --- | --- |
| [Jumper](https://getjumper.io/ai-agents) | Direct: local MCP plus Avid integration | Agent docs, Avid installation/media docs, documentation index, public OpenAPI JSON | Public integration contract; no open-source server implementation located |
| [CloudUxMCP](https://github.com/pandiaaman/CloudUxMCP) | Adjacent: MediaCentral PAM/MAM, not desktop editing | README and actual MCP registration/dispatch source | README says proprietary and confidential; no permissive license found; do not copy implementation |
| [Pro Tools MCP](https://github.com/skrul/protools-mcp-server) | Adjacent: Avid audio workstation with a different gRPC API | Client, tool registry, tool modules, license | MIT; useful architecture reference, retain notices if code is later reused |
| [MCP Video Editing Assistant](https://github.com/JossBen/mcp-video-editing-assistant) | Adjacent: Resolve and editing-pattern experiments | Four Python entry points and MIT license | Avid is an unchecked roadmap item, not implemented support |
| [Tin Man Server](https://www.calibratedsoftware.com/tin-man-server/byoai/) | Adjacent: media preparation and reporting through MCP | Vendor product, setup and release documentation | Commercial installed dependency; no public server source located |

## Jumper: feature and API inventory

The [agent guide](https://docs.getjumper.io/core-concepts/agentic-editing) documents visual, dialogue and people search, similarity search, source-range results, summaries, selects, clip exports, timeline round trips, multiple agent sessions, and customizable skills. It names Avid for timeline reading and edited timeline delivery, but provides no per-build Avid fidelity matrix or complete MCP tool schema here. These are vendor-documented capabilities, not our verified operations.

The [product page](https://getjumper.io/ai-agents) describes one-click client setup and a manually configurable MCP URL. The more specific agent guide cautions that Claude Cowork integration is unreliable; do not turn broad client compatibility into a tested claim. [Custom skills](https://docs.getjumper.io/guides/add-custom-skill) encode repeatable workflows and output conventions.

The [Avid installation guide](https://docs.getjumper.io/NLE/avid/avid-guide) describes an `.avpi` panel, the gateway helper, the Tools/Extensions menu change, an export preset for frame matching, and I/O/Q keyboard dependencies for marks/navigation. Its explicit keyboard fallback is evidence that SDK availability does not guarantee reliable native coverage. [Media loading](https://docs.getjumper.io/NLE/avid/avid-adding-media) distinguishes linked/AMA paths from managed MXF lookup by MOB ID, including shared metadata and selected/visible/all-bin scopes.

The [API entry point](https://docs.getjumper.io/developers/api) links a [specification page](https://docs.getjumper.io/api-reference/spec-files) and [OpenAPI JSON](https://docs.getjumper.io/api-reference/openapi.json). The retrieved v1.0 contract contains **40 HTTP operations**, with base `http://localhost:6699/api/v1` and an `X-License-Key` security scheme described as a Jumper Pro key. This HTTP API is not the MCP endpoint; its operation count is not an MCP tool count.

| Contract group | Operations observed |
| --- | --- |
| Health/models | Health; loaded/available models; switch visual model |
| Media and processing | Metadata; start/cancel analysis; load all or selected analysis; load transcriptions |
| Summaries | Collection/list discovery; whole-media overview; drill into a node |
| Search | Metadata facets; text, reference-image, video-frame, transcript search |
| Transcriptions | Full cached transcript; bounded source range |
| Thumbnails | Specific timestamps; time-range strips |
| Faces | Jobs/clusters; samples; paginated faces; names; reclustering; merge/move |
| Watch folders | List/create/update/delete; service start/stop/status |
| Utilities/output | Cache paths; trimmed clip export; Premiere XML generation; transcript export |

Important contract distinctions: text search returns ordered matches without similarity scores; transcript text search is substring matching. Analysis is asynchronous. Transcript ranges use half-open overlap semantics and support continuation. Public REST operations inspected do **not** include a native Avid timeline read/write endpoint, even though the MCP guide documents timeline workflows. Do not infer a hidden endpoint from that gap. The XML endpoint describes XMEML v4 and claims Avid interoperability; direct import on our 2024.12 host remains unverified and must not replace our AAF/qualified-OTIO plan.

Potential integration: users who already license Jumper could opt into a local search-provider adapter. Keep native Avid control independent. Never embed a vendor license or depend on Jumper being installed for core setup. The public API includes image-returning endpoints; our adapter must make image disclosure explicit rather than inherit a blanket metadata-only privacy claim.

## Source-level references

### Pro Tools MCP

Inspected commit `9f3170fc47d7b87d3eb4cab1b6c16d1a550392d6` ([tree](https://github.com/skrul/protools-mcp-server/tree/9f3170fc47d7b87d3eb4cab1b6c16d1a550392d6), [MIT license](https://github.com/skrul/protools-mcp-server/blob/9f3170fc47d7b87d3eb4cab1b6c16d1a550392d6/LICENSE)).

- `src/grpc/client.ts`: dynamic protobuf loading, local PTSL client, registration/session handling, permission groups and separate transport/application errors. PTSL's service, port, registration and command envelope are **not** MCAPI's contract.
- `src/tools/index.ts`: separate session, track, transport, clip, editing, marker, timeline, analysis, raw and diagnostic modules.
- Registered feature families: session info/overview/length/save; track list/selection/mute/solo; play/stop/toggle/record/playback mode; clip list; timeline selection, cut/copy/paste/clear/undo/redo; marker list/create/edit/select/delete/delete-all; timeline index refresh, track/clip queries, search and clip selection; audio analysis; raw requests; response diagnostics.
- `src/tools/analyze.ts`: bounded audio-region analysis with waveform, spectrogram, audio, peaks, events, silence and analysis modes. `src/tools/timeline.ts` is a useful reference for focused timeline retrieval instead of dumping the entire project.

Adopt the separation of concerns and bounded-query idea. Preserve our stricter output roots and explicit export authority: this client exempts temporary exports and uses string-prefix temp containment, which we should not copy. Do not expose its generic raw-command pattern. A locally constructed client is not proof the editor responded; our doctor must perform an actual read. No Pro Tools runtime validation was performed.

### CloudUxMCP

Inspected commit `efd4cf6f5d1d7575b9359aa9b0abdf1baf6130cc`, especially [mcp_server.py](https://github.com/pandiaaman/CloudUxMCP/blob/efd4cf6f5d1d7575b9359aa9b0abdf1baf6130cc/avidmcpserver/mcp_server.py). Twelve registered tools cover authentication/status, service roots, system listing/type filtering/PAM/MAM, resource listing/name lookup, system/location browsing, and generic API calls. The README also describes a React browsing/chat UI and OpenAI integration.

Useful product idea: browse enterprise resources by discovered identity and location. Our existing optional CTMS adapter already provides a constrained foundation. Keep credentials in local setup rather than model-visible tool arguments; omit generic authenticated URL/method execution. Public visibility does not override the README's proprietary/confidential notice. Record behavior and independently implement against Avid's public CTMS contract.

### MCP Video Editing Assistant

Inspected commit `25ab6f8dfcba45895ad51dd6a9e727231a6391fa` ([tree](https://github.com/JossBen/mcp-video-editing-assistant/tree/25ab6f8dfcba45895ad51dd6a9e727231a6391fa), MIT).

`server.py` is an echo/resource example. `enhanced_server.py` adds file writing/listing, timestamp and arbitrary command execution. `editing_watcher.py` registers six learning-session, cut/workflow logging, insights and next-action tools. `davinci_resolve_mcp.py` registers ten connection, timeline/project inspection, session/tool tracking, cut/color analysis, export and recommendation tools. It calls Resolve APIs; none supplies an Avid adapter.

Keep optional local pacing reports and explicit user workflow preferences as later ideas. Its cut analysis sorts video clips across tracks before comparing adjacency; our implementation should account for track identity and actual transitions. File-change events alone cannot identify the editing command performed. Do not adopt generic shell execution or market heuristic suggestions as a learned editing model.

## Tin Man: workflow reference

[Vendor MCP overview](https://www.calibratedsoftware.com/tin-man-server/byoai/), [setup](https://docs.calibratedsoftware.com/tin-man/getting-started-server), and [release notes](https://docs.calibratedsoftware.com/tin-man/release-notes) describe batch conversion/presets, metadata search, PDF/HTML camera reports/contact sheets, thumbnails, checksum-verified copying, and JSON progress. The retrieved setup HTML includes other-client configuration pointing to a compiled Python MCP module. Public editable implementation and a complete MCP schema were not located.

Plan equivalents: allowlisted batch jobs, explicit output manifests, verification receipts, local reports and preset discovery. RAW decoding and licensed DNx support are not transferable merely because their product supports them. MP4 tests cannot qualify professional camera originals. Tin Man is not evidence of controlling Avid bins or timelines.

## Changes to our delivery plan

| Stage | Addition or refinement | Acceptance evidence |
| --- | --- | --- |
| Windows release 1 | Setup wizard/CLI, client config backup/merge, doctor, per-build native capability report | Clean-machine installation; real project read through each claimed MCP client |
| Windows release 1 | Bounded project/bin/clip/marker queries and structured operation receipts | Native response agrees with saved-bin inspection; unsupported actions stay disabled |
| Windows release 2 | Timeline range/track search, source-to-sequence mapping, metadata facets, snapshot/diff | Known fixture ranges, frame rates, track identities and IDs match; stale state detected |
| Windows release 2 | Local contact sheets, camera/QC reports, trimmed exports, verified-copy jobs | Source hashes unchanged, output hashes/media checks, cancellation and partial-result receipts |
| Windows release 2 | Selects/stringouts, script-note audit and conservative interchange round trips | Actual Avid import, timing/relink validation and save/reopen; verify `CreateSubClip.create_new_sequence` separately |
| Optional analysis milestone | Transcript search first; then visual/frame similarity, summaries, optional people collections | Source evidence and bounded ranges, correction/deletion controls, measured local resource use |
| Optional analysis milestone | Watch folders and shared analysis cache keyed by media identity | No duplicate jobs, scoped paths, interrupted-write handling, moved/offline media tests |
| Optional provider milestone | Jumper adapter for already licensed users | Local auth, discovered contract/version, live search tests; core works without provider |
| Windows UI milestone | Named actions with shortcut/focus diagnostics and post-state checks | Remapped shortcuts and unexpected dialogs fail safely; no automatic retry through a different adapter |
| Workflow packaging | Original skills for ingest/QC, selects, review markers, turnover and export | Each uses supported tools and preserves write gates; executable example for each supported client |
| Later Mac/enterprise | Mac host qualification; optional CTMS browsing improvements | Separate real-host tests; no Windows evidence reused as Mac qualification |

Analysis can run concurrently within resource limits; editor mutations remain serialized per local host/project. Skills do not enforce security; server-side capability and path checks do. Reports and transcripts returned to a cloud-backed client may leave the machine even when source media processing stays local.

## Sonoma test additions

Continue with the seven available MP4 exports, Windows first. Use a disposable progressive 30 fps project and separate output directory. Compare technical metadata, exact selected ranges, thumbnails, marker/subclip persistence, and AAF/stringout results with saved-bin and rendered-output evidence. Test interruption, missing media, conflicting names and concurrent write requests. Add transcript/search assertions only when the fixture actually contains relevant speech or visible content; establish expected results by inspection first.

The MP4s are flattened edits. They can test local media workflows and new assemblies, but cannot prove reconstruction of the unavailable Premiere source timeline, effects, multicam or camera-card ingest. Original clips and Mac work remain later qualification tasks.

## Remaining uncertainty

No competitor's runtime behavior, complete MCP tool list, Avid fidelity, performance or installer reliability was independently tested. Jumper's REST specification gives a concrete optional integration path, but does not expose its panel implementation. Before using third-party code, pin the revision, preserve applicable notices and test the adapted behavior. Before publishing comparisons, refresh these dated sources and use feature evidence rather than tool counts.
