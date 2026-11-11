# Short demo video scripts — dated drafts

Status: HOLD — do not record/publish until approved. Keep on-screen text accurate to the build you record. Prefer a non-air project.

Each script assumes voiceover + screen capture. No stock “AI brain” B-roll required; show the MCP client and Media Composer project folder.

---

### V01 — 2026-11-19 — “Inventory without opening the NLE” (~60s)

**On-screen title:** Avid Media Composer MCP — project inventory  
**Build:** published `1.1.0` or any build with inspect tools

| Time | VO | Picture |
| --- | --- | --- |
| 0:00–0:08 | “You do not need Media Composer open to ask what is in an Avid project.” | Finder/Explorer on project root |
| 0:08–0:20 | “Avid Media Composer MCP connects Claude or Cursor to local project evidence through the Model Context Protocol.” | Client MCP tool list scrolling |
| 0:20–0:35 | “Start with capabilities, then inventory the tree — including active or orphaned bin locks.” | `avid_get_capabilities` → `avid_inventory_project_files` |
| 0:35–0:50 | “Drill into a bin with AVB analysis. Opaque structures stay labelled — no invented mobs.” | `avid_analyze_bin` snippet |
| 0:50–0:60 | “Offline analysis is read-only. Live edits are a separate, fail-closed path. Built by Kavy Rattana.” | End card: site URL + GitHub |

**Do not say:** time saved percentages, “official Avid,” customer names.

---

### V02 — 2026-11-26 — “Fail early on turnover packages” (~90s)

**On-screen title:** AAF / ALE / EDL triage before conform  
**Build:** inspect tools

| Time | VO | Picture |
| --- | --- | --- |
| 0:00–0:10 | “Conform time is the wrong moment to learn an AAF is opaque.” | Turnover folder with AAF/ALE/EDL |
| 0:10–0:30 | “Ask the assistant to analyze the AAF structure, parse the ALE columns, and walk the EDL events.” | Three tool calls in the client |
| 0:30–0:50 | “If OTIO is in the package, structural analysis and a handoff preview list blockers and local media manifests — still not an import.” | `avid_analyze_otio` / `avid_preview_otio_handoff` |
| 0:50–1:10 | “Marker packages can be validated before they touch a bin. Unsafe SVG overlays get rejected.” | `avid_validate_marker_package` |
| 1:10–1:30 | “Evidence first, Media Composer second. Independent MCP server for professional Avid rooms.” | End card |

---

### V03 — 2026-12-04 — “Claude / Cursor setup in one pass” (~75s)

**On-screen title:** Install Avid MCP for Claude & Cursor  
**Build:** `@latest` install path

| Time | VO | Picture |
| --- | --- | --- |
| 0:00–0:12 | “Three environment facts matter: allowed roots, inspect capability, and Node 20.” | Terminal exporting env vars |
| 0:12–0:30 | “Point the MCP client at npx latest — or a built checkout if you are testing the RC.” | JSON config for Claude/Cursor |
| 0:30–0:50 | “First prompts: ping, capabilities, detect installations, compatibility check.” | Tool results |
| 0:50–1:05 | “Add Python for AVB/AAF and ffprobe for clip metadata when those tools are empty.” | Doctor / dependency notes |
| 1:05–1:15 | “Do not enable edit until a real bridge exists.” | End card with docs/setup link placeholder |

---

### V04 — 2026-12-09 — “Visual search to selects (RC)” (~90s)

**On-screen title:** Local visual search → reviewed selects  
**Build:** `1.2.0-rc.1` from source — say so on screen

| Time | VO | Picture |
| --- | --- | --- |
| 0:00–0:12 | “This demo uses the development RC, not npm latest. Always trust tools/list.” | On-screen version badge |
| 0:12–0:30 | “Index local media by content hash. No upload of the rushes.” | `avid_index_media` |
| 0:30–0:50 | “Build a visual index, then search by text or reference frame. Similarity is not identity.” | `avid_index_visual` / `avid_search_visual` |
| 0:50–1:10 | “An editor reviews hits, then we build a straight-cut selects AAF with explicit mappings. Host import is separate.” | `avid_build_aaf_selects` |
| 1:10–1:30 | “Workflow skill avid-selects encodes these limits for the assistant. Review required — always.” | End card |

**Do not say:** “finds every shot,” “automatic selects reel approved,” Mac native parity.
