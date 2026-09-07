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

The Vercel project is not linked to the GitHub repository, so production is deployed manually after a merge:

```bash
cd landing && vercel deploy --prod --scope rattana-devs --yes
```

The legacy `*.vercel.app` alias still serves the same build. Every canonical, Open Graph, sitemap, robots and JSON-LD URL now points at the apex domain, so search engines consolidate on it.

## Published surfaces

| Path | Purpose |
| --- | --- |
| `/` | Home: definition-style overview, capabilities, architecture, install, core FAQ |
| `/tools/` | Tool reference for the 27 published MCP tools, grouped by job, with an `ItemList` and `TechArticle` schema |
| `/setup/` | Installation and client configuration with a `HowTo` schema |
| `/faq/` | Extended FAQ with a `FAQPage` schema |
| `/robots.txt` | Allows all crawlers and explicitly names GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Perplexity-User, Google-Extended, GoogleOther, Bingbot, DuckAssistBot, Applebot, Applebot-Extended, meta-externalagent, Amazonbot and CCBot |
| `/sitemap.xml` | Four URLs with `lastmod` from `lib/site.ts` |
| `/llms.txt` | llmstxt.org index: summary, key facts, site pages, source documentation |
| `/llms-full.txt` | Full site content in one Markdown file for AI answer engines |
| `/opengraph-image` | 1200x630 social preview |
| `/manifest.webmanifest` | Web app manifest |
| `/<key>.txt` | IndexNow key file for Bing, Yandex and Copilot indexing |

Structured data on the home page: `WebSite`, `SoftwareSourceCode`, `SoftwareApplication` and `FAQPage` in one `@graph`. Subpages add `BreadcrumbList`. All entity `@id` values share the apex domain so AI engines resolve one entity across pages.

Site constants live in `landing/lib/site.ts`. Bump `lastUpdated` there when content materially changes; it feeds sitemap `lastmod`, the footer freshness line and `dateModified` in JSON-LD.

## Keyword map

Primary target per page. Titles, H1s, first paragraphs and FAQ questions are written around these phrases. Rankings are tracked in Google Search Console (Performance report, filter by page).

| Page | Primary keyword | Secondary keywords |
| --- | --- | --- |
| `/` | Avid Media Composer MCP | Avid MCP server, Avid Media Composer AI, Model Context Protocol Avid, Claude Avid integration |
| `/tools/` | Avid MCP tools | AVB analysis, AAF analysis MCP, ALE parser, EDL parser, Avid project analysis |
| `/setup/` | install Avid Media Composer MCP | Avid MCP Claude Desktop, Avid MCP Cursor, MCP server Avid setup, npx avid-media-composer-mcp |
| `/faq/` | Avid Media Composer MCP FAQ | is there an MCP for Avid, Avid AI editing, does MCP modify Avid projects, Avid MCP supported versions |

Question-shaped queries that AI Overviews, ChatGPT and Perplexity tend to answer from FAQ blocks: "Is there an MCP server for Avid Media Composer?", "Can AI edit an Avid timeline?", "What is an AVB file?", "How do I connect Claude to Avid Media Composer?". These appear verbatim as FAQ questions.

Review cadence: monthly. Compare Search Console queries per page with this table, add pages for query clusters that are landing on the wrong page, and refresh `lastUpdated`.

## Google Search Console

The site carries the `google-site-verification` meta tag in `landing/app/layout.tsx`. That tag verifies a URL-prefix property for whichever Google account owns the token. Steps that need a signed-in human:

1. In Search Console, add the property `https://avid-media-composer-mcp.com/` (URL-prefix). It verifies immediately through the existing meta tag. Optionally add a Domain property for `avid-media-composer-mcp.com`; that needs a DNS TXT record, which can be added with `vercel dns add avid-media-composer-mcp.com '' TXT '<token>' --scope rattana-devs`.
2. Submit `https://avid-media-composer-mcp.com/sitemap.xml` under Sitemaps.
3. Request indexing for `/`, `/tools/`, `/setup/` and `/faq/` with URL Inspection.
4. Keep the old `https://avid-media-composer-mcp.vercel.app/` property until its impressions reach zero; canonicals already point at the apex domain.
5. In Bing Webmaster Tools, import the Search Console property; IndexNow submissions are already wired below.

The `claude-seo` plugin can read Search Console once `~/.config/claude-seo/google-api.json` holds a service account or OAuth client with the `webmasters` scope; see its `google_auth.py --setup`.

## IndexNow

`landing/public/<key>.txt` holds the IndexNow key. After each production deploy, notify Bing and partners:

```bash
KEY=$(basename landing/public/*.txt .txt | grep -E '^[0-9a-f]{32}$')
curl -s -X POST https://api.indexnow.org/indexnow -H 'Content-Type: application/json' -d "{\"host\":\"avid-media-composer-mcp.com\",\"key\":\"$KEY\",\"keyLocation\":\"https://avid-media-composer-mcp.com/$KEY.txt\",\"urlList\":[\"https://avid-media-composer-mcp.com/\",\"https://avid-media-composer-mcp.com/tools/\",\"https://avid-media-composer-mcp.com/setup/\",\"https://avid-media-composer-mcp.com/faq/\"]}"
```

A `200` or `202` response means the submission was accepted.

## Post-deploy verification

```bash
for p in "" tools/ setup/ faq/ robots.txt sitemap.xml llms.txt llms-full.txt; do
  printf '%-16s %s\n' "/$p" "$(curl -s -o /dev/null -w '%{http_code}' https://avid-media-composer-mcp.com/$p)"
done
curl -s https://avid-media-composer-mcp.com/ | grep -c 'vercel.app'   # expect 0
```
