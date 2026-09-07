# Website, domain and search setup

The project website is served by Vercel from `landing/` at `https://avid-media-composer-mcp.com/`. This page records the domain configuration, the search and AI-discovery surfaces the site publishes, the keyword targets the pages are written for, and the Google Search Console steps that need a human account.

## Domain

| Item | Value |
| --- | --- |
| Registrar | Vercel (Name.com), team `rattana-devs`, renews 2027-09-06 |
| Nameservers | `ns1.vercel-dns.com`, `ns2.vercel-dns.com` |
| Vercel project | `rattana-devs/avid-media-composer-mcp`, root directory `landing` |
| Production domains | `avid-media-composer-mcp.com` (primary), `www.avid-media-composer-mcp.com` (308 to apex), `avid-media-composer-mcp.vercel.app` (legacy alias) |
| HTTP | 308 to HTTPS |
| GitHub repository homepage | `https://avid-media-composer-mcp.com/` (was the legacy `*.vercel.app` alias) |

The Vercel project is not linked to the GitHub repository, so production is deployed manually after a merge:

```bash
cd landing && vercel deploy --prod --scope rattana-devs --yes
```

The legacy `*.vercel.app` alias still serves the same build. Every canonical, Open Graph, sitemap, robots and JSON-LD URL now points at the apex domain, so search engines consolidate on it.

## Published surfaces

| Path | Purpose |
| --- | --- |
| `/` | Home: definition-style overview, capabilities, architecture, guide hub, install, core FAQ |
| `/tools/` | Tool reference for the published MCP tools, grouped by job, with an `ItemList` and `TechArticle` schema |
| `/setup/` | Installation and client configuration with a `HowTo` schema |
| `/faq/` | Extended FAQ with a `FAQPage` schema |
| `/avb-file/` | AVB (Avid bin) format guide |
| `/aaf-file/` | AAF interchange format guide |
| `/ale-file/` | ALE (Avid Log Exchange) format guide |
| `/edl-file/` | CMX-style EDL format guide |
| `/bin-locking/` | Avid bin locking and `.lck` files |
| `/compatibility/` | Media Composer compatibility matrix and system requirements |
| `/ai-automation/` | AI features, the Extensions SDK and what an MCP server adds |
| `/robots.txt` | Allows all crawlers and explicitly names GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Perplexity-User, Google-Extended, GoogleOther, Bingbot, DuckAssistBot, Applebot, Applebot-Extended, meta-externalagent, Amazonbot and CCBot |
| `/sitemap.xml` | Every page, with `lastmod` from `lib/site.ts` |
| `/llms.txt` | llmstxt.org index: summary, key facts, site pages, source documentation |
| `/llms-full.txt` | Full site content in one Markdown file for AI answer engines |
| `/opengraph-image` | 1200x630 social preview, referenced by every page |
| `/manifest.webmanifest` | Web app manifest |
| `/<key>.txt` | IndexNow key file for Bing, Yandex and Copilot indexing |

The seven guide pages are generated from `landing/lib/guides.ts` through the `app/[guide]/` route, and `/llms.txt` and `/llms-full.txt` are generated from the same source by `landing/lib/llms.ts`. Adding a guide or a tool updates the pages, the sitemap, the home-page hub, the footer and both AI-crawler surfaces together, so they cannot drift apart.

Each guide page carries `BreadcrumbList`, `TechArticle` (with `abstract`, `keywords` and `mentions` for the MCP tools it covers) and `FAQPage`. Every page opens with a self-contained answer paragraph, because AI answer engines quote the first passage under the H1 and cannot resolve anaphora back to the title.

Structured data on the home page: `WebSite`, `SoftwareSourceCode`, `SoftwareApplication` and `FAQPage` in one `@graph`. Subpages add `BreadcrumbList`. All entity `@id` values share the apex domain so AI engines resolve one entity across pages.

Site constants live in `landing/lib/site.ts`. Bump `lastUpdated` there when content materially changes; it feeds sitemap `lastmod`, the footer freshness line and `dateModified` in JSON-LD.

## Keyword map

Primary target per page. Titles, H1s, first paragraphs and FAQ questions are written around these phrases. Query clusters were taken from Google autocomplete expansions of the seed terms in 2026-09; rankings are tracked in Google Search Console (Performance report, filter by page).

| Page | Primary keyword | Secondary keywords |
| --- | --- | --- |
| `/` | Avid Media Composer MCP | Avid MCP server, Avid Media Composer AI, Model Context Protocol Avid, Claude Avid integration |
| `/tools/` | Avid MCP tools | AVB analysis, AAF analysis MCP, ALE parser, EDL parser, Avid project analysis |
| `/setup/` | install Avid Media Composer MCP | Avid MCP Claude Desktop, Avid MCP Cursor, MCP server Avid setup, npx avid-media-composer-mcp |
| `/faq/` | Avid Media Composer MCP FAQ | is there an MCP for Avid, Avid AI editing, does MCP modify Avid projects, Avid MCP supported versions |
| `/avb-file/` | AVB file | avb file format, avb file extension, how to open avb file, avid avb file, avb file converter |
| `/aaf-file/` | AAF file | what is an aaf file, aaf file structure, what does an aaf file contain, aaf vs omf file |
| `/ale-file/` | ALE file | avid ale file, ale avid log exchange, avid export ale, import ale avid media composer |
| `/edl-file/` | EDL file | avid edl format, edl example, create edl avid, avid edl manager, cmx 3600 edl |
| `/bin-locking/` | Avid bin locking | how does avid bin locking work, avid bin is locked at the file level, avid lck file |
| `/compatibility/` | Avid Media Composer compatibility matrix | media composer os compatibility, avid media composer system requirements, media composer windows 11 |
| `/ai-automation/` | Avid Media Composer AI | ai tools for avid media composer, avid media composer automation, avid media composer api, avid media composer panel sdk, mcp server for video editing |

The guide pages exist to reach a much larger informational audience than the brand terms can. "Avid MCP" queries are low volume and already ranked for; the format and workflow clusters ("what is an aaf file", "avid bin locking", "avid media composer compatibility matrix") are where the demand actually is, and each one ends at a tool that solves the problem it describes.

Question-shaped queries that AI Overviews, ChatGPT and Perplexity tend to answer from FAQ blocks appear verbatim as FAQ questions on the page that owns them: "Is there an MCP server for Avid Media Composer?", "Can AI edit an Avid timeline?", "What is an AVB file?", "How does Avid bin locking work?", "Why does Avid say the bin is locked at the file level?", "Does Avid Media Composer have an API?".

Review cadence: monthly. Compare Search Console queries per page with this table, add a guide to `landing/lib/guides.ts` for any query cluster landing on the wrong page, and refresh `lastUpdated`.

## Google Search Console

The site carries the `google-site-verification` meta tag in `landing/app/layout.tsx`. That tag verifies a URL-prefix property for whichever Google account owns the token. Steps that need a signed-in human:

1. In Search Console, add the property `https://avid-media-composer-mcp.com/` (URL-prefix). It verifies immediately through the existing meta tag. Optionally add a Domain property for `avid-media-composer-mcp.com`; that needs a DNS TXT record, which can be added with `vercel dns add avid-media-composer-mcp.com '' TXT '<token>' --scope rattana-devs`.
2. Submit `https://avid-media-composer-mcp.com/sitemap.xml` under Sitemaps.
3. Request indexing with URL Inspection for `/`, `/tools/`, `/setup/`, `/faq/`, `/avb-file/`, `/aaf-file/`, `/ale-file/`, `/edl-file/`, `/bin-locking/`, `/compatibility/` and `/ai-automation/`.
4. Keep the old `https://avid-media-composer-mcp.vercel.app/` property until its impressions reach zero; canonicals already point at the apex domain.
5. In Bing Webmaster Tools, import the Search Console property; IndexNow submissions are already wired below.

The `claude-seo` plugin can read Search Console once `~/.config/claude-seo/google-api.json` holds a service account or OAuth client with the `webmasters` scope; see its `google_auth.py --setup`.

## IndexNow

`landing/public/<key>.txt` holds the IndexNow key. After each production deploy, notify Bing and partners:

```bash
KEY=$(basename landing/public/*.txt .txt | grep -E '^[0-9a-f]{32}$')
URLS=$(curl -s https://avid-media-composer-mcp.com/sitemap.xml | grep -o '<loc>[^<]*' | sed 's/<loc>//' | jq -R . | jq -sc .)
curl -s -X POST https://api.indexnow.org/indexnow -H 'Content-Type: application/json' \
  -d "{\"host\":\"avid-media-composer-mcp.com\",\"key\":\"$KEY\",\"keyLocation\":\"https://avid-media-composer-mcp.com/$KEY.txt\",\"urlList\":$URLS}"
```

A `200` or `202` response means the submission was accepted.

## Post-deploy verification

```bash
for p in "" tools/ setup/ faq/ avb-file/ aaf-file/ ale-file/ edl-file/ bin-locking/ compatibility/ ai-automation/ robots.txt sitemap.xml llms.txt llms-full.txt; do
  printf '%-16s %s\n' "/$p" "$(curl -s -o /dev/null -w '%{http_code}' https://avid-media-composer-mcp.com/$p)"
done
curl -s https://avid-media-composer-mcp.com/ | grep -c 'vercel.app'   # expect 0
```
