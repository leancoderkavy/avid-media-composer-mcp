# HOLD-MERGE: 30-day marketing content pack

**Status:** draft only. Do not merge, deploy, publish, post, or send without an explicit founder decision.

**Window:** 16 November 2026 – 15 December 2026  
**Product:** [Avid Media Composer MCP](https://avid-media-composer-mcp.com/)  
**Founder credit:** Kavy Rattana  
**Audience:** professional film/TV editors and post houses  
**Sibling product:** [Premiere Pro MCP](https://github.com/leancoderkavy/premiere-pro-mcp)

## What this folder contains

| Path | Deliverable |
| --- | --- |
| [CONTENT_CALENDAR.md](CONTENT_CALENDAR.md) | Dated calendar for the full window |
| [articles/](articles/) | Six SEO articles/tutorials grounded in exposed MCP tools |
| [social/](social/) | X, LinkedIn, demo scripts, pro-editor community posts |
| [DIRECTORY_LISTING.md](DIRECTORY_LISTING.md) | MCP directory / listing copy refresh drafts |

## Capability grounding rules used here

- Articles only describe tools that appear in the live `tools/list` surface for this repository (published `1.1.0` analysis/bridge set plus development-branch media-intelligence tools when labelled as such).
- Published npm `@latest` today is `1.1.0`. Repository version is `1.2.0-rc.1` and is not on the `latest` tag yet. Copy that depends on RC tools says so.
- No fabricated stats, customer counts, rankings, or testimonials.
- Offline analysis is read-only; live Media Composer mutation requires a compatible Extension bridge or the separately qualified Windows native adapter path.
- Avid trademarks belong to Avid Technology, Inc. This project is independent and not affiliated with or endorsed by Avid.

## Suggested later port (not done in this PR)

When approved for site publication, port article bodies into `landing/lib/guides.ts` (or dedicated landing routes) so sitemap, `/llms.txt`, and FAQ schema stay single-sourced. Until then, keep drafts here so a HOLD-MERGE PR cannot accidentally ship live marketing pages.
