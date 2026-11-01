import type { Metadata } from "next"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { JsonLd } from "@/components/json-ld"
import { SiteFooter } from "@/components/site-footer"
import { SiteNav } from "@/components/site-nav"
import { absoluteUrl, breadcrumbs, docs, lastUpdated, ogImage, pages } from "@/lib/site"

const description =
  "A local Avid Media Composer MCP for post houses: connect Claude, Cursor, Codex and other MCP clients alongside Avid's native AI for bounded project, metadata and interchange workflows."

export const metadata: Metadata = {
  title: { absolute: "Avid MCP for Post Houses | Work Alongside Native AI" },
  description,
  alternates: { canonical: pages.postHouses.path },
  openGraph: { title: pages.postHouses.title, description, url: absoluteUrl(pages.postHouses.path), type: "article", images: [ogImage] },
  twitter: { card: "summary_large_image", title: pages.postHouses.title, description, images: [ogImage.url] }
}

const crumbs = [{ name: "Post houses", path: pages.postHouses.path }]

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    breadcrumbs(crumbs),
    {
      "@type": "Article",
      "@id": absoluteUrl(`${pages.postHouses.path}#article`),
      url: absoluteUrl(pages.postHouses.path),
      headline: "Avid MCP for post houses: the protocol lane alongside native AI",
      description,
      dateModified: lastUpdated,
      inLanguage: "en-US"
    }
  ]
}

export default function PostHousesPage() {
  return (
    <main>
      <JsonLd data={structuredData} />
      <SiteNav />
      <section className="page shell">
        <Breadcrumbs items={crumbs} />
        <div className="section-heading">
          <p>For post houses</p>
          <h1>Keep Avid&apos;s native AI. <em>Add the MCP lane.</em></h1>
          <span>
            Avid&apos;s IBC2026 announcements and Media Composer 2026.8 materials describe native Ready to Edit and
            embedded AI workflows. They do not document an MCP server. This independent, local-first MCP connects
            MCP-compatible agents—Claude, Cursor, Codex and others—to the Avid project evidence your post team already manages.
          </span>
        </div>

        <div className="prose">
          <h2>Two complementary surfaces</h2>
          <p>
            Use Avid&apos;s built-in capabilities where they belong in the editor. Use this MCP when an assistant editor,
            coordinator, or automation agent needs a standards-based way to inspect projects and prepare a handoff across
            tools. The MCP does not replace Avid&apos;s native AI, claim to be an Avid product, or turn a plan into a completed edit.
          </p>

          <h2>Post-house work it can support</h2>
          <ul className="plain-list">
            <li><strong>Assistant editor tasks:</strong> inventory project trees, find active locks, inspect bins and sequences, and prepare bounded edit-plan previews.</li>
            <li><strong>Bin organization:</strong> inspect AVB structure, clips, tracks, views and metadata before a human reviews any proposed organization.</li>
            <li><strong>Metadata and review:</strong> inspect ALE, transcripts, markers, media streams and project evidence for logging, search and review workflows.</li>
            <li><strong>Conform and turnover:</strong> validate AAF and EDL structures, inspect OTIO exchanges, and produce source-referenced evidence for conform or delivery handoffs.</li>
          </ul>
          <p>
            Availability depends on the installed build, configured roots, dependencies and adapter. Read-only analysis is
            the default; live Media Composer operations require the separately installed compatible Extension bridge and
            its advertised capabilities.
          </p>

          <h2>Security that fits an on-prem workflow</h2>
          <p>
            Run the server on the workstation or an approved internal host. Allowed roots define which project folders it
            may read, offline analysis does not modify Avid projects or source media, and unsupported or unavailable live
            operations fail closed. Streamable HTTP is available for an internal deployment with bearer authentication;
            teams should still apply their own network, identity, storage and endpoint controls.
          </p>
          <p>
            The MCP is not a hosted media service: it does not require uploading source media for its local analysis.
            Review the <a href={docs.security}>security policy</a>, <a href={docs.architecture}>architecture notes</a> and
            <a href={pages.setup.path}> setup guide</a> with your post-house security team before enabling any shared or
            live workflow.
          </p>

          <h2>A factual boundary</h2>
          <p>
            Avid&apos;s official <a href="https://www.avid.com/press-room/2026/08/avid-shows-the-future-of-agentic-editing-at-ibc2026">IBC2026 announcement</a>
            describes Ready to Edit, embedded AI and expanded APIs; its <a href="https://www.avid.com/resource-center/whats-new-avid-media-composer-2026-8">2026.8 notes</a>
            describe OTIO and SDK improvements. Neither page documents an MCP server. This project therefore makes a narrower claim:
            it provides an independent MCP interface to the project, interchange and guarded bridge capabilities that this repository actually implements.
          </p>

          <p><a className="button primary" href={pages.setup.path}>Connect a client</a></p>
        </div>
      </section>
      <SiteFooter />
    </main>
  )
}
