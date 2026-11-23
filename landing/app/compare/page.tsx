import type { Metadata } from "next"
import { CheckCircle, XCircle } from "lucide-react"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { JsonLd } from "@/components/json-ld"
import { SiteFooter } from "@/components/site-footer"
import { SiteNav } from "@/components/site-nav"
import { absoluteUrl, breadcrumbs, lastUpdated, ogImage, pages } from "@/lib/site"

const description =
  "Compare the open-source Avid Media Composer MCP server with Jumper: which is right for your workflow, and when each is the better choice."

export const metadata: Metadata = {
  title: { absolute: pages.compare.title },
  description,
  alternates: { canonical: pages.compare.path },
  openGraph: { title: pages.compare.title, description, url: absoluteUrl(pages.compare.path), type: "article", images: [ogImage] },
  twitter: { card: "summary_large_image", title: pages.compare.title, description, images: [ogImage.url] }
}

const crumbs = [{ name: "Compare", path: pages.compare.path }]

const faqItems = [
  {
    question: "Is there an MCP server for Avid Media Composer?",
    answer: "Yes. Avid Media Composer MCP is an open-source, local MCP server that connects AI clients to read-only Avid project, bin, AAF, ALE, and EDL analysis. Jumper also offers an MCP server with visual search, dialogue search, and AAF-based write-back to live sequences."
  }
]

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    breadcrumbs(crumbs),
    {
      "@type": "ComparisonPage",
      "@id": absoluteUrl(`${pages.compare.path}#comparison`),
      url: absoluteUrl(pages.compare.path),
      name: "Avid Media Composer MCP servers, compared",
      dateModified: lastUpdated,
      inLanguage: "en-US",
      about: [
        {
          "@type": "SoftwareApplication",
          name: "Avid Media Composer MCP Server",
          url: absoluteUrl("/"),
          applicationCategory: "DeveloperApplication"
        },
        {
          "@type": "SoftwareApplication",
          name: "Jumper",
          url: "https://getjumper.io",
          applicationCategory: "VideoEditingApplication"
        }
      ]
    },
    {
      "@type": "FAQPage",
      "@id": absoluteUrl(`${pages.compare.path}#faq`),
      mainEntity: faqItems.map(item => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer }
      }))
    }
  ]
}

export default function ComparePage() {
  return (
    <main>
      <JsonLd data={structuredData} />
      <SiteNav />
      <section className="page shell">
        <Breadcrumbs items={crumbs} />
        <div className="section-heading">
          <p>Open-source server vs Jumper</p>
          <h1>Avid Media Composer MCP servers, <em>compared</em></h1>
          <span>
            Two ways to connect AI clients to Avid Media Composer. This page compares what each does, where each is
            strongest, and when Jumper is the better pick.
          </span>
        </div>

        <div className="prose">
          <h2>What is an MCP server for Avid Media Composer?</h2>
          <p>
            An MCP (Model Context Protocol) server connects AI clients such as Claude, Cursor, or Codex to Avid Media
            Composer projects and workflows. The AI can read project structure, search footage, and in some cases write
            edits back to the timeline.
          </p>
          <p>
            <strong>Avid does not ship an MCP server.</strong> Two options exist: this open-source server and Jumper.
          </p>

          <h2>Avid Media Composer MCP (open-source)</h2>
          <p>
            This server reads AVB bins, AAF interchange files, ALE metadata, and CMX-style EDL files through native and
            Python-based parsers. It exposes project structure, clip metadata, sequences, and media file inspection
            through ffprobe, all without modifying source files or requiring a live Media Composer connection.
          </p>
          <p>
            <strong>What it does:</strong>
          </p>
          <ul>
            <li>Analyze AVB bins, AAF, ALE, and EDL files offline</li>
            <li>Read project structure, clip metadata, tracks, and markers</li>
            <li>Inspect media files (codec, timecode, duration) via ffprobe</li>
            <li>Preview guarded edit plans with explicit confirmation tokens</li>
            <li>Local-only analysis — no uploads, no cloud processing</li>
          </ul>
          <p>
            <strong>What it does not do:</strong>
          </p>
          <ul>
            <li>Visual search of footage content</li>
            <li>Dialogue or transcript search by what was said</li>
            <li>Search by people or faces in footage</li>
            <li>Direct write-back to live Media Composer timelines</li>
          </ul>

          <h2>Jumper</h2>
          <p>
            Jumper is a commercial tool with a local MCP server and Media Composer panel. AI agents can search analyzed
            footage by visuals, dialogue, and people, read the active sequence, and write edits back through an AAF
            bridge that preserves Avid&apos;s media links.
          </p>
          <p>
            <strong>What it does:</strong> (source:{" "}
            <a href="https://getjumper.io/ai-agents/avid-media-composer" target="_blank" rel="noreferrer">
              getjumper.io/ai-agents/avid-media-composer
            </a>
            , last updated October 8, 2026)
          </p>
          <ul>
            <li>Search footage by what is shown (visual search)</li>
            <li>Search by what is said (dialogue search, 111 languages)</li>
            <li>Search by who appears (name a person once, find every appearance)</li>
            <li>Read the active Media Composer sequence</li>
            <li>Write edits back to Avid via AAF bridge (preserves media links)</li>
            <li>Analysis runs locally, works on shared storage (Avid NEXIS)</li>
            <li>Free trial: 40 searches, no time limit</li>
            <li>Windows and macOS support</li>
          </ul>

          <h2>Comparison table</h2>
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Avid MCP (open-source)</th>
                <th>Jumper</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Read AVB bins, AAF, ALE, EDL</td>
                <td>
                  <CheckCircle className="check" />
                </td>
                <td>
                  <span className="dim">—</span>
                </td>
              </tr>
              <tr>
                <td>Visual search of footage</td>
                <td>
                  <XCircle className="x" />
                </td>
                <td>
                  <CheckCircle className="check" />
                </td>
              </tr>
              <tr>
                <td>Dialogue / transcript search</td>
                <td>
                  <XCircle className="x" />
                </td>
                <td>
                  <CheckCircle className="check" />
                </td>
              </tr>
              <tr>
                <td>Search by people / faces</td>
                <td>
                  <XCircle className="x" />
                </td>
                <td>
                  <CheckCircle className="check" />
                </td>
              </tr>
              <tr>
                <td>Read active sequence</td>
                <td>
                  <span className="dim">Offline only</span>
                </td>
                <td>
                  <CheckCircle className="check" />
                </td>
              </tr>
              <tr>
                <td>Write edits to live timeline</td>
                <td>
                  <span className="dim">Extension bridge only (catalog)</span>
                </td>
                <td>
                  <CheckCircle className="check" /> (via AAF)
                </td>
              </tr>
              <tr>
                <td>Works offline</td>
                <td>
                  <CheckCircle className="check" />
                </td>
                <td>
                  <span className="dim">Analysis requires preprocessing</span>
                </td>
              </tr>
              <tr>
                <td>License</td>
                <td>MIT (open-source)</td>
                <td>Commercial</td>
              </tr>
              <tr>
                <td>Pricing</td>
                <td>Free</td>
                <td>Free trial (40 searches), paid after</td>
              </tr>
              <tr>
                <td>Shared storage support</td>
                <td>
                  <CheckCircle className="check" />
                </td>
                <td>
                  <CheckCircle className="check" /> (Avid NEXIS)
                </td>
              </tr>
            </tbody>
          </table>

          <h2>When Jumper is the better pick</h2>
          <p>
            Jumper is built for footage search and live timeline workflows. Choose Jumper when you need to:
          </p>
          <ul>
            <li>Search footage by what is shown, said, or who appears</li>
            <li>Have an AI build or edit a sequence based on content search results</li>
            <li>Write edits back to a live Media Composer session</li>
            <li>Work with analyzed footage libraries across shared storage</li>
          </ul>

          <h2>When the open-source server fits</h2>
          <p>
            This server is designed for offline project analysis, file validation, and interchange workflows. Use it
            when you need to:
          </p>
          <ul>
            <li>Inspect project structure, bins, and interchange files without opening Media Composer</li>
            <li>Validate AAF, ALE, or EDL files before conform or turnover</li>
            <li>Read clip metadata, track structure, and markers for project audits</li>
            <li>Stay fully offline with no preprocessing or external services</li>
            <li>Extend or customize the server for your own workflows (MIT license)</li>
          </ul>

          <h2>Frequently asked questions</h2>
          {faqItems.map(item => (
            <details key={item.question} open>
              <summary>
                <h3>{item.question}</h3>
                <b>+</b>
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}

          <h2>Get started</h2>
          <p>
            <a href={pages.setup.path}>Install the open-source server</a> or{" "}
            <a href="https://getjumper.io/ai-agents/avid-media-composer" target="_blank" rel="noreferrer">
              learn about Jumper for Avid Media Composer
            </a>
            .
          </p>
        </div>
      </section>
      <SiteFooter />
    </main>
  )
}
