# Pro-editor community posts — dated drafts

Status: HOLD — do not post. Match each community’s self-promo rules. Prefer answering a real workflow question; link once at the end if allowed.

Communities envisioned (verify current norms before posting): Avid-centric forums (e.g. Creative COW Avid), editor subreddits, private post-house Discords/Slacks you already belong to. Do not scrape or spam.

---

### C01 — 2026-11-18 — Project audit / locks

**Suggested venue:** editors’ forum or AE channel  
**Hook:** question-led

Title/subject: How are you auditing Avid project trees and `.lck` files before migration?

Body:

We have been treating “what is actually in this show folder?” as an AI-assistable problem without opening Media Composer.

Practical loop that has been useful on non-air projects:

1. Constrain the tool to explicit project roots  
2. Inventory/classify the tree and surface active vs orphaned `.lck` files beside bins  
3. Deep-read critical `.avb` bins; keep undecodable chunks labelled opaque instead of guessed  
4. Only then open the NLE for anything mutative  

We packaged that as an open-source MCP server (Avid Media Composer MCP) so Claude/Cursor can call those analyzers as tools. Offline path is read-only. Live timeline apply stays behind a fail-closed Extension bridge.

Curious how other AEs are handling orphaned locks on shared storage — still seeing a lot of tribal knowledge there.

(Link only if the venue allows: website or GitHub README.)

**Author credit if asked:** Kavy Rattana

---

### C02 — 2026-11-24 — Interchange validation

**Suggested venue:** Creative COW / Avid users  
**Hook:** pre-conform package hygiene

Subject: Pre-flighting AAF/ALE/EDL with local tools (not “AI magic”)

Body:

Conform keeps teaching the same lesson: the package looked fine in Finder.

I have been using local structured parsers before import:

- AAF object/evidence report (not an import)  
- ALE heading/column/row parse  
- CMX-style EDL event walk  
- Bounded OTIO validation + a handoff preview that lists media manifest / blockers  

Wrapped for MCP clients as Avid Media Composer MCP tools (`avid_analyze_aaf`, `avid_analyze_ale`, `avid_analyze_edl`, `avid_analyze_otio`, `avid_preview_otio_handoff`). Independent project — not an Avid product.

What is your current pre-conform checklist when the producer drops a Zip at 5:55?

---

### C03 — 2026-12-03 — Facility rollout / inspect-only

**Suggested venue:** private post Slack/Discord (members already know you)  
**Hook:** rollout pattern

Hey team — sharing a conservative pattern if anyone is evaluating MCP assistants on Avid shows:

- Seat policy: allowed roots = show folders only  
- Default capability: inspect  
- Day-one verification: ping → capabilities → one inventory → one bin analyze  
- Edit capability only after bridge/native qualification on a disposable project  
- Version honesty: npm `@latest` is `1.1.0`; media intelligence lives in the RC checkout until published  

Happy to do a 20-minute inspect-only screenshare on a junk project. No “AI will cut your show” pitch.

---

### C04 — 2026-12-08 — Selects / visual search (RC caveats)

**Suggested venue:** AE / assistants channel  
**Hook:** selects prep

Question for AEs building selects reels:

If you had local visual search over hashed rushes (CLIP similarity, human review required), then a straight-cut selects AAF builder that does **not** auto-import, would that fit your prep day — or do you still want everything inside Media Composer only?

I am testing that path in Avid Media Composer MCP’s `1.2.0-rc.1` branch (`avid_search_visual`, `avid_build_aaf_selects`, plus the `avid-selects` skill). Explicitly not on npm latest yet.

Not claiming identity detection or “approved selects.” Looking for workflow friction reports from people who actually prep bins for a living.
