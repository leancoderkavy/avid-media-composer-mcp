# Research: Avid Media Composer MCP

Research date: 2026-08-15
Method: focused Tavily searches and extraction across current official Avid documentation, GitHub, package registries, and comparable NLE/DAW MCP projects.

## Executive conclusion

The research did not find a substantive public MCP server dedicated to Avid Media Composer. It did find a viable architecture:

1. **Media Composer Extensions SDK** for sanctioned live project/bin/timeline integration.
2. **AVB/AAF/ALE/EDL and file-system analysis** for useful offline inspection.
3. **MediaCentral APIs** for enterprise asset-management environments, not as a universal local Media Composer editing API.
4. A guarded MCP layer modeled on the strongest patterns in Resolve, Premiere Pro, Pro Tools, and FCPXML MCPs.

The central constraint is access: Avid publicly describes its Extensions SDK, but the linked onboarding page currently says new partners are not actively being onboarded. Consequently, the repository implements and tests the MCP server, offline analyzers, edit taxonomy, and bridge protocol now while labeling live control as provider-gated.

## Avid automation and data surfaces

### Media Composer Extensions

Avid says Media Composer Extensions integrate tools directly into the editor and can work with the project, bin, or timeline. Media Composer 2025.12 renamed third-party Panels to Media Composer Extensions and added an Extensions menu. The current 2025 documentation index lists 2025.12.2, while the Avid version matrix identifies it as the current 2025.12 patch and records the qualified operating-system ranges.

The current developer landing page presents Extensions as a development surface, while the older onboarding page says new partner onboarding is paused. This unresolved public conflict makes Extensions the correct target architecture, but not a dependency this repository can truthfully claim to have obtained, packaged, signed, or live-validated. SDK access, license/redistribution terms, package format, and signing requirements must be confirmed directly with Avid.

Sources:

- [Avid Media Composer Extensions](https://connect.avid.com/media_composer_extensions.html)
- [Avid Extensions / former Panel SDK onboarding](https://connect.avid.com/23-q4-global-mc-panel-sdk-lp.html)
- [Media Composer 2025 Documentation](https://kb.avid.com/pkb/articles/en_US/User_Guide/Media-Composer-2025-Documentation)
- [Avid Media Composer documentation and version matrix](https://kb.avid.com/pkb/articles/compatibility/en267087)
- [Media Composer 2025.12 What's New](https://resources.avid.com/SupportFiles/attach/Media_Composer/2025.12/Media_Composer_v2025.12_What's_New.pdf)
- [Avid overview of Media Composer Extensions](https://www.avid.com/resource-center/media-composer-extensions)

### Public Avid developer APIs

Avid's public developer portal lists Open I/O for hardware integration, AAX for audio plug-ins, Avid Media Toolkit for OP-Atom/AAF media workflows, and MediaCentral APIs for managed back ends. These are valuable integration surfaces, but none is presented as a universal public local timeline-editing scripting API comparable to Resolve's scripting API or Pro Tools PTSL.

MediaCentral's CTMS API is a HAL/REST family for Production Management, Asset Management, and Newsroom Management. It is an optional enterprise adapter, not a substitute for local Media Composer extension control.

Sources:

- [Avid Developer portal](https://developer.avid.com/)
- [MediaCentral Media Suite API](https://developer.avid.com/ctms)
- [MediaCentral Media Suite API overview](https://developer.avid.com/ctms/overview.html)
- [MediaCentral client examples](https://developer.avid.com/ctms/examples.html)

### Interchange and project formats

Avid documentation identifies AAF, ALE, and EDL as supported project/sequence/metadata exchange paths. Community and tool evidence consistently identifies:

- `.avp` — project descriptor/configuration
- `.avs` — settings
- `.avb` — bin contents, including clips and sequences
- `.lck` — shared-bin lock indicator

AVB/AVP specifications are not public. This is why the implementation reports a distinction between decoded structures, independent `pyavb` results, and opaque binary evidence.

Media Composer 2025.6 added OTIO import alongside export. OTIO is therefore a valuable, supported interchange lane for future handoff packages, but it is not evidence of live control over an open project or timeline. The implementation should validate conservative OTIO output and report documented loss or relink constraints instead of treating a successful export as an in-host edit.

Sources:

- [Media Composer 2025.x Editing Guide](https://resources.avid.com/SupportFiles/attach/Media_Composer/Media_Composer_v2025.x_Editing_Guide.pdf)
- [Media Composer 2025.6 What's New](https://www.avid.com/resource-center/whats-new-avid-media-composer-20256)
- [Avid File-based Workflows Guide](https://resources.avid.com/SupportFiles/attach/FileBased_WorkflowsGuide.pdf)
- [pyavb](https://github.com/markreidvfx/pyavb)
- [pyaaf2](https://github.com/markreidvfx/pyaaf2)
- [Community discussion of AVP/AVS/AVB roles](https://community.avid.com/forums/t/125837.aspx)
- [AVB format discussion and interchange recommendation](https://stackoverflow.com/questions/8909754/parse-avids-avb-format)

### Evidence from a shipping Avid extension

Jumper's public Avid documentation shows a real Panel SDK/Extensions plug-in installed as an `.avpi`, mentions the `avid-api-gateway` helper process, and documents that some unstable SDK actions fall back to configured keyboard shortcuts. This supports a layered adapter design but also demonstrates why the MCP must advertise live capability per operation instead of assuming complete SDK coverage.

Source:

- [Jumper for Avid Media Composer](https://docs.getjumper.io/NLE/avid/avid-index)
- [Jumper Avid installation and required shortcuts](https://docs.getjumper.io/NLE/avid/avid-guide)
- [Jumper Avid troubleshooting](https://docs.getjumper.io/NLE/avid/avid-troubleshooting)

## Comparable MCP projects

| Project | Useful pattern | Lesson applied here |
| --- | --- | --- |
| [DaVinci Resolve MCP](https://github.com/samuelgursky/davinci-resolve-mcp) | Official scripting API, full API coverage, source-safe analysis, sidecar outputs | Keep source media immutable and separate live API coverage from offline analysis |
| [Premiere Pro MCP](https://github.com/leancoderkavy/premiere-pro-mcp) | TypeScript MCP + in-app bridge, tool annotations, capability profiles, edit previews | Use a dedicated extension bridge, structured tool results, capabilities, and exact preview/apply tokens |
| [Pro Tools MCP](https://github.com/skrul/protools-mcp-server) | Read-only default and granular write groups around PTSL | Default to inspection and require explicit authority for editing |
| [FCPXML MCP](https://github.com/DareDev256/fcpxml-mcp-server) | Honest asymmetry between XML import and manual export; dry-run relink | State platform limits plainly and preserve a useful offline interchange mode |
| [MCP reference servers](https://github.com/modelcontextprotocol/servers) | Educational implementations and explicit security warning | Treat reference patterns as a starting point, then add a use-case-specific threat boundary |

Tavily also found several Premiere and Resolve MCP variants but no comparable public Avid-specific implementation. A generic “video editing assistant” listed Avid only as a future roadmap item.

## Design decisions derived from the research

- TypeScript MCP server over local stdio; no default network listener.
- Python sidecar for `pyavb`/`pyaaf2`, invoked without a shell and with depth/item/output/time bounds.
- Native ALE and EDL parsing so core metadata analysis does not depend on Python.
- Optional `ffprobe` for read-only media metadata and frame/packet counting.
- Explicit allowed roots and symlink skipping.
- `inspect` is the only default authority.
- Live actions require a fresh bridge heartbeat, protocol match, command support, per-edit-operation support, exact plan token, and destructive opt-in.
- Bridge and offline mutation are separate capability families.
- `.lck` files are treated as authoritative collaboration signals.
- No arbitrary Media Composer script or raw UI-automation tool is exposed in the initial server.
- The 167-action catalog is a contract/roadmap; the connected extension's advertised operations are the runtime source of truth.

## Remaining research and provider work

1. Obtain lawful access to the Media Composer Extensions SDK and its license.
2. Map the public SDK's real object model and supported actions to the bridge catalog.
3. Implement the `.avpi` extension and verify it against supported Media Composer versions.
4. Determine which actions require SDK calls, MediaCentral adapters, command invocation, or explicitly documented keyboard fallback.
5. Capture real project/bin/sequence fixtures from each supported version with user authorization.
6. Run destructive-edit validation only on disposable projects with backups and post-operation state comparison.
