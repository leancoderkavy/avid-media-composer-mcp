# X (Twitter) posts — dated drafts

Status: HOLD — do not post. Founder: Kavy Rattana. Product: Avid Media Composer MCP. Sibling: Premiere Pro MCP.

Tone: precise, editor-native, no engagement bait, no fabricated metrics.

---

### X01 — 2026-11-16
You can put an AI assistant on an Avid show without opening Media Composer.

Avid Media Composer MCP exposes project trees, AVB bins, AAF/ALE/EDL, locks, and media metadata as MCP tools — read-only offline.

Live timeline changes stay behind a fail-closed bridge.

Built by Kavy Rattana. Sibling: Premiere Pro MCP.

---

### X02 — 2026-11-17
Editors who bounce between Premiere and Avid: same MCP idea, different NLE evidence.

• Avid Media Composer MCP — bins, interchange, guarded Avid ops  
• Premiere Pro MCP — Premiere workflows  

Independent projects. Not affiliated with Adobe or Avid.

---

### X03 — 2026-11-20
That mysterious locked bin might be a `.lck`, not a corrupt AVB.

`avid_inventory_project_files` reports active vs orphaned bin locks beside the project tree — without writing the bin.

Useful before you restart half the bay.

---

### X04 — 2026-11-23
Facility rule for AI on Avid projects:

`AVID_MCP_ALLOWED_ROOTS` = only the shows that seat is allowed to see.  
`AVID_MCP_CAPABILITIES=inspect` until a bridge is real.

An assistant that cannot wander the SAN is a feature.

---

### X05 — 2026-11-25
`avid_analyze_aaf` is not “import AAF.”

It walks AAF structure through pyaaf2 and returns evidence — including opaque sections — so conform can fail early on the package, not late on the timeline.

---

### X06 — 2026-11-29
Trustworthy editorial AI says “opaque” when pyavb cannot decode a structure.

Guessing mob graphs is how you ship fiction into a turnover note.

Avid Media Composer MCP is built to keep those categories separate.

---

### X07 — 2026-12-01
OTIO arriving with the turnover?

`avid_analyze_otio` flags transitions, retimes, nesting, and routing risks inside bounded JSON.  
`avid_preview_otio_handoff` builds a local media manifest and blocker list.

Still not an auto-import.

---

### X08 — 2026-12-05
No Extension bridge advertising the operation → `avid_apply_edit_plan` fails closed.

That is the correct behavior for a post house, even if it makes a demo less flashy.

---

### X09 — 2026-12-06
Dev-branch honesty: local Whisper, CLIP visual search, and media QC live in `1.2.0-rc.1`.

They are not what `npx avid-media-composer-mcp@latest` installs today (`1.1.0`).

Always believe `tools/list` on the build you actually run.

---

### X10 — 2026-12-10
Five workflow skills ship with the project:

`avid-ingest-qc` · `avid-selects` · `avid-review-markers` · `avid-turnover` · `avid-export`

They teach assistants the implemented tools and evidence limits — they do not widen filesystem access.
