# MCP directory / listing copy refresh (draft)

Status: HOLD — do not submit to directories until approved.  
Keep every claim discoverable via `tools/list` on the named version.

## Short blurb (≤280 characters)

Independent MCP server for Avid Media Composer: read-only project/bin/AAF/ALE/EDL/media analysis for Claude, Cursor, and other MCP clients. Guarded live edits require a compatible Extension bridge. MIT. By Kavy Rattana. Sibling: Premiere Pro MCP.

## Medium blurb (≈500–700 characters)

Avid Media Composer MCP connects MCP-compatible AI assistants to local Avid project evidence. Inventory project trees, detect active or orphaned bin locks, analyze AVB bins and AAF/ALE/EDL/OTIO interchange, inspect clip metadata, and screen Media Composer/OS compatibility — without modifying bins or source media offline. Live operations use fail-closed, tokenized edit plans through a compatible Extension bridge (development branch also documents a build-specific Windows native adapter). Open source (MIT), independent, not affiliated with Avid. Founder: Kavy Rattana. Related: Premiere Pro MCP for Premiere rooms.

## Long listing (directories that allow markdown)

### What it is

An open-source [Model Context Protocol](https://modelcontextprotocol.io/) server for professional Avid Media Composer post workflows. Use it from Claude Desktop, Claude Code, Cursor, VS Code, Codex, LM Studio, or any stdio / authenticated Streamable HTTP MCP client.

Website: https://avid-media-composer-mcp.com/  
npm: `avid-media-composer-mcp`  
GitHub: https://github.com/leancoderkavy/avid-media-composer-mcp

### What assistants can do (published `1.1.0` via `@latest`)

- Discover Avid projects and inventory project files (including `.lck` lock reporting)
- Analyze AVB bins (`pyavb`), AAF (`pyaaf2`), ALE, CMX-style EDL, bounded OTIO
- Inspect configuration evidence and clip metadata (`ffprobe`)
- Preview OTIO handoffs and assess supplied DNx turnover metadata
- Validate marker packages; compare transcript revisions without returning transcript text
- Evaluate Media Composer / OS / architecture combinations against a release matrix snapshot
- Preview and apply guarded edit plans only through a compatible Extension bridge

### Development branch (`1.2.0-rc.1` in repo — not npm `latest` yet)

Local media intelligence: content-hash indexing, facets, QC reports, Whisper transcription, speaker workflows, CLIP visual search, captions, contact sheets, verified artifacts, analysis jobs, AAF selects building/merging helpers, saved-bin snapshot inspection, and a guarded Windows native adapter on a documented qualified build. Discover exact tools with `tools/list` on that build.

### Safety model

- Offline analysis is read-only for project files and source media
- Access is limited to `AVID_MCP_ALLOWED_ROOTS`
- Capabilities are explicit (`inspect`, and separately `edit` / export / project-write as configured)
- Missing bridge or unsupported operations fail closed
- Not affiliated with or endorsed by Avid Technology, Inc.

### Install (inspect-only)

```bash
npx -y avid-media-composer-mcp@latest
```

Set `AVID_MCP_ALLOWED_ROOTS` and `AVID_MCP_CAPABILITIES=inspect`. See repository README for Claude/Cursor JSON and Python/`ffprobe` dependencies.

### Author

Kavy Rattana — also maintains [Premiere Pro MCP](https://github.com/leancoderkavy/premiere-pro-mcp).

## One-line npm / GitHub about text (optional refresh)

MCP server for source-safe Avid Media Composer analysis (AVB/AAF/ALE/EDL/media) and guarded editing automation via compatible clients.

## Categories / tags (suggested)

`avid` `media-composer` `mcp` `post-production` `editorial` `aaf` `avb` `nle` `claude` `cursor`

## Do not include in listings

- User counts, download ranks, or ROI statistics (unverified)
- “Official Avid” or partnership language
- Testimonials without written approval on file
- Claims that Mac native live operations are qualified
- Claims that `@latest` includes RC-only media intelligence
