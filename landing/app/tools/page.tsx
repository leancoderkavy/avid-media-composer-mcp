import type { Metadata } from "next"
import { ShieldCheck } from "lucide-react"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { JsonLd } from "@/components/json-ld"
import { SiteFooter } from "@/components/site-footer"
import { SiteNav } from "@/components/site-nav"
import { absoluteUrl, breadcrumbs, docs, lastUpdated, pages, repo } from "@/lib/site"
import { toolCount, toolGroups } from "@/lib/tools"

const description =
  `Reference for the ${toolCount} MCP tools in the published Avid Media Composer MCP server: project inventory, AVB bin analysis, AAF, ALE, EDL and OTIO parsing, ffprobe media inspection, compatibility checks and guarded edit plans.`

export const metadata: Metadata = {
  title: { absolute: "Avid Media Composer MCP Tools: Full Reference for the MCP Server" },
  description,
  alternates: { canonical: pages.tools.path },
  openGraph: { title: pages.tools.title, description, url: absoluteUrl(pages.tools.path), type: "article" }
}

const crumbs = [{ name: "Tools", path: pages.tools.path }]

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    breadcrumbs(crumbs),
    {
      "@type": "TechArticle",
      "@id": absoluteUrl(`${pages.tools.path}#article`),
      headline: pages.tools.title,
      description,
      url: absoluteUrl(pages.tools.path),
      dateModified: lastUpdated,
      inLanguage: "en-US",
      about: { "@id": absoluteUrl("/#software") },
      isPartOf: { "@id": absoluteUrl("/#website") }
    },
    {
      "@type": "ItemList",
      name: "Avid Media Composer MCP tools",
      numberOfItems: toolCount,
      itemListElement: toolGroups.flatMap(g => g.tools).map((tool, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: tool.name,
        description: tool.purpose,
        url: absoluteUrl(`${pages.tools.path}#${tool.name}`)
      }))
    }
  ]
}

export default function ToolsPage() {
  return (
    <main>
      <JsonLd data={structuredData} />
      <SiteNav />
      <section className="page shell">
        <Breadcrumbs items={crumbs} />
        <div className="section-heading">
          <p>Tool reference</p>
          <h1>MCP tools for <em>Avid Media Composer.</em></h1>
          <span>
            The published <code>avid-media-composer-mcp</code> package exposes {toolCount} Model Context Protocol tools.
            Every offline tool is read-only. The only mutating tool applies a previewed, token-confirmed plan through a
            compatible Avid Extension bridge and fails closed when that bridge is unavailable.
          </span>
        </div>

        <div className="prose">
          <p>
            Tool discovery through <code>tools/list</code> is authoritative for the installed package. The development branch
            adds further local media intelligence, saved-snapshot and native Windows tools; see{" "}
            <a href={docs.implementationStatus}>implementation status</a> for the exact build.
          </p>
        </div>

        {toolGroups.map(group => (
          <section className="tool-group" key={group.title} aria-labelledby={group.title}>
            <h2 id={group.title}>{group.title}</h2>
            <p>{group.description}</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Tool</th><th>Purpose</th><th>Mutation</th></tr></thead>
                <tbody>
                  {group.tools.map(tool => (
                    <tr key={tool.name} id={tool.name}>
                      <td><code>{tool.name}</code></td>
                      <td>{tool.purpose}</td>
                      <td>{tool.mutation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <section className="tool-group">
          <h2>Resources and prompts</h2>
          <p>Alongside the tools, the server exposes one MCP resource and two prompts.</p>
          <ul className="plain-list">
            <li><code>avid://catalog/edit-actions</code> resource: the 167-action editing catalog. Catalog coverage is a design map, not live validation.</li>
            <li><code>avid-project-audit</code> prompt: audit a project before conform, turnover, migration or archive.</li>
            <li><code>avid-safe-edit</code> prompt: preview, confirm and apply a bounded edit through the bridge.</li>
          </ul>
        </section>

        <section className="tool-group">
          <h2>Bounded output limits</h2>
          <p>Large projects are bounded by explicit environment limits and every report identifies truncation.</p>
          <ul className="plain-list">
            <li><code>AVID_MCP_MAX_FILES</code>, default 10000</li>
            <li><code>AVID_MCP_MAX_BINS</code>, default 100</li>
            <li><code>AVID_MCP_MAX_MEDIA_FILES</code>, default 100</li>
            <li><code>AVID_MCP_COMMAND_TIMEOUT_MS</code>, default 30000</li>
          </ul>
        </section>

        <p className="boundary">
          <ShieldCheck /> A cataloged editing action is a planned protocol contract, not proof that Media Composer performed it.
          Read the <a className="inline-link" href={docs.capabilityMatrix}>capability matrix</a> and{" "}
          <a className="inline-link" href={repo}>source on GitHub</a> for status vocabulary and evidence.
        </p>
      </section>
      <SiteFooter />
    </main>
  )
}
