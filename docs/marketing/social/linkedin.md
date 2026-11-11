# LinkedIn posts — dated drafts

Status: HOLD — do not post. Audience: post supervisors, AE leads, facility engineers. Founder: Kavy Rattana.

---

### LI01 — 2026-11-16

**Subject line / first line:** AI on Avid does not have to mean “script the timeline or nothing.”

Most of an assistant editor’s morning is file evidence: which bins exist, which are locked, whether the AAF/ALE/EDL package is even coherent, whether the workstation matches the release matrix.

Avid Media Composer MCP is an independent Model Context Protocol server that exposes that evidence to Claude, Cursor, and other MCP clients — offline, read-only, rooted to folders you authorize.

Live Media Composer mutation is a separate path: preview a plan, confirm an exact token, apply only through a compatible Extension bridge. No bridge, fail closed.

I built this for professional Avid rooms (and Premiere Pro MCP as the sibling for Premiere bays). Not affiliated with Avid Technology.

If you want the inspect-only setup path, start with allowed roots + `inspect` capability and `avid_get_capabilities` before any flashy demo.

— Kavy Rattana

---

### LI02 — 2026-11-21

**Setup post: Claude Desktop + Cursor**

Connecting an AI client to Avid project files is mostly configuration discipline:

1. Node 20+  
2. `AVID_MCP_ALLOWED_ROOTS` pointed at real show folders  
3. `AVID_MCP_CAPABILITIES=inspect`  
4. Python + pinned deps for AVB/AAF; `ffprobe` for clip probes  
5. Verify with `avid_ping` and `avid_get_capabilities`

`npx -y avid-media-composer-mcp@latest` installs the published `1.1.0` analysis surface. The repository’s `1.2.0-rc.1` media-intelligence tools are real in source but not on the `latest` tag yet — facility docs should say that out loud.

Full draft tutorial is in our marketing pack (HOLD until site publish).

---

### LI03 — 2026-11-27

**Pre-conform without romanticizing AI**

A bad AAF still looks like a file.

Before you burn an online session, structured local checks help:

- `avid_analyze_aaf` / `avid_analyze_ale` / `avid_analyze_edl`  
- `avid_analyze_otio` + `avid_preview_otio_handoff`  
- `avid_analyze_dnx_turnover` when DNx metadata is part of the package  
- `avid_validate_marker_package` for marker deliveries  

None of these certify color or perceptual sync. They reduce “surprise opacity” before Media Composer import.

That is the bar I care about for post-house AI: fewer invented answers, more labelled evidence.

---

### LI04 — 2026-12-02

**How a post house should roll out Avid MCP**

Layer it.

1. Policy — roots, inspect-only seats, secrets handling  
2. AE daily — project inventory, bin analysis, interchange validation  
3. Optional RC seats — local QC, transcripts, visual search (label the version)  
4. Guarded live ops — only where bridge/native qualification exists  

Workflow skills (`avid-ingest-qc`, `avid-selects`, `avid-review-markers`, `avid-turnover`, `avid-export`) teach assistants the tool limits. They are not a substitute for SOPs.

Happy to talk architecture with facilities evaluating MCP — without fake ROI slides.

---

### LI05 — 2026-12-07

**QC findings are not delivery certificates**

The development branch can decode bounded windows for black, freeze, silence, loudness, and timestamp-variation findings (`avid_media_qc`), write JSON/HTML reports, and keep jobs cancellable.

That is useful for ingest triage. It is not a substitute for your QC vendor, loudness spec ownership, or legal delivery paperwork.

Same discipline for Whisper transcripts and CLIP visual search: local, reviewable, capped, and honest about what similarity scores are not.

If your AI vendor cannot say “review required,” do not put it on picture lock media.

---

### LI06 — 2026-12-12

**Guarded edit plans > demo magic**

The editing catalog lists planned actions. Host proof is separate (`avid_get_extension_capability_manifest`).

Safe sequence:

1. Bridge healthy?  
2. `avid_preview_edit_plan` → risk labels + token  
3. Human confirms the exact plan  
4. `avid_apply_edit_plan` applies that plan only  

Tokenized confirmation is how you keep an assistant from improvising on a living sequence.

Independent project. MIT. Sibling Premiere Pro MCP for cross-NLE teams.
