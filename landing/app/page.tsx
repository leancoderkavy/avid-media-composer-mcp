import {
  ArrowRight, Binary, Boxes, CircleCheck, ClipboardCheck, Code2,
  FileSearch, Film, FolderLock, GitFork, HardDrive, Network, ShieldCheck, Sparkles
} from "lucide-react"
import { HeroDemo } from "@/components/hero-demo"
import { JsonLd } from "@/components/json-ld"
import { SiteFooter } from "@/components/site-footer"
import { SiteNav } from "@/components/site-nav"
import { faq } from "@/lib/faq"
import { absoluteUrl, docs, lastUpdated, npmUrl, packageVersion, pages, repo, siteName, siteUrl } from "@/lib/site"


const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": absoluteUrl("/#website"),
      name: siteName,
      url: absoluteUrl("/"),
      description: "Source-safe Avid Media Composer project intelligence for MCP-compatible AI clients.",
      inLanguage: "en-US",
      publisher: { "@id": absoluteUrl("/#software") }
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": absoluteUrl("/#software"),
      name: "Avid Media Composer MCP Server",
      version: packageVersion,
      description: "Open-source MCP server for read-only Avid project analysis and guarded editing automation.",
      url: absoluteUrl("/"),
      codeRepository: repo,
      sameAs: [repo, npmUrl],
      programmingLanguage: ["TypeScript", "Python"],
      runtimePlatform: "Node.js 20 or newer",
      license: "https://opensource.org/license/mit",
      isAccessibleForFree: true,
      dateModified: lastUpdated,
      keywords: [
        "Avid Media Composer MCP",
        "Model Context Protocol",
        "AVB analysis",
        "AAF analysis",
        "ALE parser",
        "EDL parser",
        "post-production automation"
      ]
    },
    {
      "@type": "SoftwareApplication",
      "@id": absoluteUrl("/#app"),
      name: "Avid Media Composer MCP Server",
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: "Model Context Protocol server",
      operatingSystem: "Windows, macOS",
      softwareVersion: packageVersion,
      downloadUrl: npmUrl,
      installUrl: absoluteUrl(pages.setup.path),
      softwareHelp: absoluteUrl(pages.faq.path),
      featureList: absoluteUrl(pages.tools.path),
      license: "https://opensource.org/license/mit",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      url: siteUrl,
      sameAs: [repo, npmUrl]
    },
    {
      "@type": "FAQPage",
      "@id": absoluteUrl("/#faq"),
      mainEntity: faq.map(item => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer }
      }))
    }
  ]
}

const tools = [
  ["avid_analyze_project", "Project"], ["avid_analyze_bin", "AVB"], ["avid_analyze_aaf", "AAF"],
  ["avid_analyze_ale", "ALE"], ["avid_analyze_edl", "EDL"], ["avid_analyze_clip", "Media"],
  ["avid_inventory_project_files", "Files"], ["avid_check_compatibility", "System"],
  ["avid_get_bridge_status", "Bridge"], ["avid_preview_edit_plan", "Safety"]
]

export default function Home() {
  return (
    <main>
      <JsonLd data={structuredData} />
      <SiteNav />

      <section className="hero shell" id="top">
        <div className="grid-bg" />
        <div className="hero-copy">
          <div className="overline"><Sparkles /> Open-source Model Context Protocol server</div>
          <h1>Avid Media Composer MCP for <em>AI workflows.</em></h1>
          <p>Avid Media Composer MCP is an open-source Model Context Protocol server that lets Claude, ChatGPT, Cursor and other AI clients inspect Media Composer projects, AVB bins, AAF, ALE, EDL, locks, configurations, and media metadata with source-safe, read-only tools built for post-production.</p>
          <div className="actions">
            <a className="button primary" href={pages.setup.path}><Code2 /> Install the server</a>
            <a className="button secondary" href={pages.tools.path}><ClipboardCheck /> Browse the tools</a>
          </div>
        </div>
        <HeroDemo />
        <div className="proof">
          <div><FileSearch /><span><strong>Read-only analysis</strong><small>Source-safe by default</small></span></div>
          <div><HardDrive /><span><strong>Windows + macOS</strong><small>Qualified Avid releases</small></span></div>
          <div><ShieldCheck /><span><strong>Fail-closed editing</strong><small>Exact confirmation tokens</small></span></div>
          <div><GitFork /><span><strong>MIT licensed</strong><small>Independent open source</small></span></div>
        </div>
      </section>

      <section className="section shell" id="capabilities">
        <div className="section-heading">
          <p>What works now</p><h2>Structured evidence.<br /><em>Not screen scraping.</em></h2>
          <span>Purpose-built analyzers expose useful editorial context while preserving unknown or proprietary data as clearly labeled evidence. See the <a className="inline-link" href={pages.tools.path}>full MCP tool reference</a> and the <a className="inline-link" href={docs.capabilityMatrix}>capability matrix</a>.</span>
        </div>
        <div className="feature-grid">
          <article><FolderLock /><h3>Project and bin intelligence</h3><p>Inventory project trees, detect active or orphaned locks, and inspect AVB clips, sequences, tracks, views, and metadata.</p></article>
          <article><Binary /><h3>Interchange validation</h3><p>Parse AAF, ALE, and CMX-style EDL structures while identifying missing, malformed, truncated, or opaque data.</p></article>
          <article><Film /><h3>Media inspection</h3><p>Use ffprobe for codec, container, stream, duration, frame-rate, timecode, packet, frame, and optional hash evidence.</p></article>
          <article><CircleCheck /><h3>Compatibility checks</h3><p>Evaluate Media Composer, operating system, and architecture combinations against source-linked qualification rules.</p></article>
          <article><ClipboardCheck /><h3>Guarded edit plans</h3><p>Preview bounded plans, classify risk, require destructive opt-in, and bind approval to an exact SHA-256 token.</p></article>
          <article><Network /><h3>Explicit bridge state</h3><p>Report heartbeat freshness and supported operations. No bridge, stale state, or unsupported action means no live edit.</p></article>
        </div>
      </section>

      <section className="tool-strip" aria-label="Available Avid MCP tools">
        <div className="tool-track">{[...tools, ...tools].map(([name, type], i) => <div className="tool" key={`${name}-${i}`}><span>{type}</span><code>{name}</code></div>)}</div>
      </section>

      <section className="section shell" id="workflow">
        <div className="section-heading centered"><p>Two independent lanes</p><h2>Useful offline. <em>Guarded when live.</em></h2><span>Analysis never needs to pretend the editor is connected. Live control never silently falls back to UI automation.</span></div>
        <div className="architecture">
          <div><small>01</small><Boxes /><h3>MCP client</h3><p>Claude, ChatGPT, Codex, Cursor, or another standards-compatible client.</p></div>
          <ArrowRight className="flow-arrow" />
          <div><small>02</small><Code2 /><h3>TypeScript server</h3><p>Allowed-root enforcement, native parsers, bounded Python inspection, and risk controls.</p></div>
          <ArrowRight className="flow-arrow" />
          <div className="split-card"><small>03</small><div><FileSearch /><h3>Analysis lane</h3><p>AVB · AAF · ALE · EDL · media</p></div><div><ShieldCheck /><h3>Live-control lane</h3><p>Compatible Avid Extension required</p></div></div>
        </div>
      </section>

      <section className="section shell install" id="install">
        <div className="section-heading"><p>Local setup</p><h2>Run beside your <em>Avid project.</em></h2><span>Start with inspect-only authority. Add the Python dependencies for AVB and AAF analysis, and ffprobe when media inspection is needed.</span></div>
        <div className="install-grid">
          <ol>
            <li><b>1</b><span><strong>Clone and install</strong><small>Node.js 20+ and Python 3.9+</small></span></li>
            <li><b>2</b><span><strong>Set allowed project roots</strong><small>Keep authority scoped to known folders</small></span></li>
            <li><b>3</b><span><strong>Connect your MCP client</strong><small>Use the local stdio command</small></span></li>
          </ol>
          <pre><code><span className="muted"># PowerShell</span>{"\n"}git clone {repo}{"\n"}cd avid-media-composer-mcp{"\n"}npm ci{"\n"}python -m pip install -r python/requirements.txt{"\n"}npm run build{"\n\n"}<span className="prompt">$env:AVID_MCP_CAPABILITIES = &quot;inspect&quot;</span>{"\n"}node .\dist\index.js</code></pre>
        </div>
        <p className="boundary"><ShieldCheck /> Live Media Composer editing requires a separately installed, compatible Avid Extension bridge. The server does not claim edits from previews or catalog entries. Full client configuration for Claude, Cursor, VS Code and Codex is on the <a className="inline-link" href={pages.setup.path}>setup page</a>.</p>
      </section>

      <section className="section shell faq" id="faq">
        <div className="section-heading"><p>Frequently asked questions</p><h2>Avid MCP, <em>clearly bounded.</em></h2><span>Straight answers about supported formats, privacy, compatibility, and live editing. More questions are answered on the <a className="inline-link" href={pages.faq.path}>full FAQ</a>.</span></div>
        <div>{faq.map(item => <details key={item.question}><summary>{item.question}<b>+</b></summary><p>{item.answer}</p></details>)}</div>
      </section>

      <section className="cta shell">
        <div><p>Build a safer AI-assisted post workflow.</p><h2>Start with the project evidence.</h2></div>
        <a className="button primary" href={repo} target="_blank" rel="noreferrer"><GitFork /> Explore on GitHub</a>
      </section>

      <SiteFooter />
    </main>
  )
}
