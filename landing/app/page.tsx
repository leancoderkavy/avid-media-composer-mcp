import {
  ArrowRight, Binary, Boxes, CircleCheck, ClipboardCheck, Code2, Cpu, FileSearch, Film, FolderLock,
  GitFork, HardDrive, HeartPulse, Layers, Network, ShieldCheck, TerminalSquare
} from "lucide-react"
import { ClientPicker } from "@/components/client-picker"
import { CopyButton } from "@/components/copy-button"
import { HeroDemo } from "@/components/hero-demo"
import { JsonLd } from "@/components/json-ld"
import { SiteFooter } from "@/components/site-footer"
import { SiteNav } from "@/components/site-nav"
import { WorkflowRail } from "@/components/workflow-rail"
import { faq } from "@/lib/faq"
import { guidePath, guides } from "@/lib/guides"
import { toolCount } from "@/lib/tools"
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
      "@type": "ItemList",
      "@id": absoluteUrl("/#guides"),
      name: "Avid format and workflow guides",
      numberOfItems: guides.length,
      itemListElement: guides.map((guide, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: guide.metaTitle,
        url: absoluteUrl(guidePath(guide.slug))
      }))
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

const marqueeTools = [
  ["avid_analyze_project", "Project"], ["avid_analyze_bin", "AVB"], ["avid_analyze_aaf", "AAF"],
  ["avid_analyze_ale", "ALE"], ["avid_analyze_edl", "EDL"], ["avid_analyze_clip", "Media"],
  ["avid_analyze_otio", "OTIO"], ["avid_inventory_project_files", "Files"],
  ["avid_check_compatibility", "System"], ["avid_get_bridge_status", "Bridge"],
  ["avid_preview_edit_plan", "Safety"], ["avid_apply_edit_plan", "Guarded"]
]

const safePrompt =
  "Check my Avid MCP connection with avid_ping and avid_get_capabilities, then run avid_analyze_project on one allowed root. Make no changes."

const setupSteps = [
  {
    title: "Install the prerequisites",
    body: "Node.js 20 or newer runs the server. Python 3.9 or newer with the pinned pyavb and pyaaf2 packages unlocks AVB and AAF analysis, and ffprobe on PATH unlocks clip inspection."
  },
  {
    title: "Scope the server's authority",
    body: "Point AVID_MCP_ALLOWED_ROOTS at the Avid project folders the server may read and leave AVID_MCP_CAPABILITIES on inspect. Paths outside an allowed root are refused."
  },
  {
    title: "Connect your client",
    body: "Add the configuration above, then fully quit and reopen your assistant so it launches the local stdio server."
  },
  {
    title: "Run a read-only check",
    body: "Use the prompt below. It reports capabilities, dependency health and project evidence, and it changes nothing."
  }
]

export default function Home() {
  return (
    <main>
      <JsonLd data={structuredData} />
      <SiteNav />

      <section className="hero shell" id="top">
        <div className="grid-bg" />
        <div className="hero-copy">
          <div className="overline">Open source <i /> Local-first <i /> Fail-closed editing</div>
          <h1>MCP for Avid Media Composer: read your project as evidence you can <em>verify before you act.</em></h1>
          <p>
            Connect the MCP-compatible client you already use to a local, read-only Avid analyzer. Inspect projects,
            bins, and interchange files first, then preview and confirm any guarded edit against current bridge state.
          </p>
          <div className="actions">
            <a className="button primary" href={pages.setup.path}><Code2 /> Install the server</a>
            <a className="button secondary" href={pages.tools.path}><ClipboardCheck /> Browse {toolCount} tools</a>
          </div>
          <small className="hero-note">
            Analysis is read-only and stays on your machine. Applied plans require a live bridge and an exact confirmation token.
          </small>
        </div>

        <div id="demo"><HeroDemo /></div>

        <div className="proof">
          <div><Layers /><span><strong>v{packageVersion}</strong><small>Current published release</small></span></div>
          <div><HardDrive /><span><strong>Windows + macOS</strong><small>Qualified Avid releases</small></span></div>
          <div><FolderLock /><span><strong>Local-first</strong><small>Media never leaves your machine</small></span></div>
          <div><GitFork /><span><strong>MIT licensed</strong><small>Source available on GitHub</small></span></div>
        </div>
      </section>

      <section className="section shell" id="workflow">
        <div className="section-heading">
          <p>Illustrated tool workflow</p>
          <h2>Read the evidence. <em>Then change anything.</em></h2>
          <span>
            Four real MCP tools carry a request from first inventory to a confirmed plan. This maps the tool contract;
            it is not a recording of a live Media Composer session.
          </span>
        </div>
        <WorkflowRail />
      </section>

      <section className="section shell" id="capabilities">
        <div className="section-heading">
          <p>What works now</p>
          <h2>Structured evidence.<br /><em>Not screen scraping.</em></h2>
          <span>
            Purpose-built analyzers expose useful editorial context while preserving unknown or proprietary data as
            clearly labeled evidence. See the <a className="inline-link" href={pages.tools.path}>full MCP tool reference</a>{" "}
            and the <a className="inline-link" href={docs.capabilityMatrix}>capability matrix</a>.
          </span>
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

      <section className="tool-strip" aria-label={`${toolCount} available Avid MCP tools`}>
        <p className="strip-label">Local analysis <i /> {toolCount} MCP tools</p>
        <div className="tool-track">
          {[...marqueeTools, ...marqueeTools].map(([name, type], i) => (
            <div className="tool" key={`${name}-${i}`}><span>{type}</span><code>{name}</code></div>
          ))}
        </div>
      </section>

      <section className="section shell" id="connect">
        <div className="section-heading centered">
          <p>Connect in about ten minutes</p>
          <h2>Use the assistant <em>you already have.</em></h2>
          <span>
            Pick your client and copy one configuration block. The server starts in inspect-only mode, so the first run
            reads evidence and makes no edits.
          </span>
        </div>

        <ClientPicker />

        <div className="setup-grid">
          <ol className="setup-steps">
            {setupSteps.map((step, i) => (
              <li key={step.title}>
                <b>{String(i + 1).padStart(2, "0")}</b>
                <span><strong>{step.title}</strong><small>{step.body}</small></span>
              </li>
            ))}
          </ol>

          <aside className="prompt-card">
            <div className="prompt-card-head">
              <span><TerminalSquare /> Safe first prompt</span>
              <CopyButton value={safePrompt} label="Copy prompt" />
            </div>
            <p>{safePrompt}</p>
            <ul>
              <li><CircleCheck /> Reads only the roots you allowed</li>
              <li><CircleCheck /> Makes no offline or live changes</li>
              <li><CircleCheck /> Reports dependency gaps instead of guessing</li>
            </ul>
            <a className="inline-link" href={pages.setup.path}>Advanced setup: HTTP transport, Codex, LM Studio →</a>
          </aside>
        </div>

        <p className="boundary">
          <ShieldCheck /> Live Media Composer editing requires a separately installed, compatible Avid Extension bridge.
          The server never claims an edit from a preview or a catalog entry. Full client configuration is on the{" "}
          <a className="inline-link" href={pages.setup.path}>setup page</a>.
        </p>
      </section>

      <section className="section shell" id="architecture">
        <div className="section-heading">
          <p>Two independent lanes</p>
          <h2>Useful offline. <em>Guarded when live.</em></h2>
          <span>
            Analysis never needs to pretend the editor is connected, and live control never silently falls back to UI
            automation. Read the <a className="inline-link" href={docs.architecture}>architecture notes</a> and the{" "}
            <a className="inline-link" href={docs.bridge}>bridge contract</a>.
          </span>
        </div>

        <div className="architecture">
          <div><small>01</small><Boxes /><h3>MCP client</h3><p>Claude, ChatGPT, Codex, Cursor, or another standards-compatible client.</p></div>
          <ArrowRight className="flow-arrow" />
          <div><small>02</small><Code2 /><h3>TypeScript server</h3><p>Allowed-root enforcement, native parsers, bounded Python inspection, and risk controls.</p></div>
          <ArrowRight className="flow-arrow" />
          <div className="split-card">
            <small>03</small>
            <div><FileSearch /><h3>Analysis lane</h3><p>AVB · AAF · ALE · EDL · OTIO · media</p></div>
            <div><ShieldCheck /><h3>Live-control lane</h3><p>Compatible Avid Extension required</p></div>
          </div>
        </div>

        <div className="compat-grid">
          <article>
            <Cpu />
            <h3>Source-linked compatibility</h3>
            <p>Compatibility contracts cover the latest Media Composer release tracks on qualified Windows and macOS combinations, each traced back to an Avid source.</p>
            <code>avid_get_compatibility_matrix</code>
          </article>
          <article>
            <HeartPulse />
            <h3>Heartbeat diagnostics</h3>
            <p>Bridge status separates a missing bridge from a stale one, so an unanswered request is never mistaken for a completed edit.</p>
            <code>avid_get_bridge_status</code>
          </article>
          <article>
            <ClipboardCheck />
            <h3>Honest coverage reports</h3>
            <p>Enabled authority, dependency health, source coverage and truncation are reported explicitly before you rely on a result.</p>
            <code>avid_get_capabilities</code>
          </article>
        </div>

        <p className="boundary">
          <ShieldCheck /> Know the boundary: a compatibility-rule match describes Avid&apos;s published qualification, not proof
          that this connector has been exercised on that host. Catalog actions are planned contracts until an Extension
          advertises them. See <a className="inline-link" href={docs.implementationStatus}>implementation status</a>.
        </p>
      </section>

      <section className="section shell">
        <div className="docs-band">
          <div>
            <h2>Need the full tool list, schemas, or troubleshooting?</h2>
            <p>The repository documents every setup path, evidence limit, and known security boundary.</p>
          </div>
          <a className="button secondary" href={docs.readme} target="_blank" rel="noreferrer"><FileSearch /> Read the documentation</a>
        </div>
      </section>

      <section className="section shell" id="guides">
        <div className="section-heading">
          <p>Format and workflow guides</p>
          <h2>Know the file <em>before you open it.</em></h2>
          <span>
            Reference pages for the Avid formats and workflow states these tools read: what each file contains, how it
            fails, and which MCP tool inspects it.
          </span>
        </div>
        <div className="feature-grid">
          {guides.map(guide => (
            <article key={guide.slug}>
              <FileSearch />
              <h3><a className="inline-link" href={guidePath(guide.slug)}>{guide.navLabel}</a></h3>
              <p>{guide.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section shell faq" id="faq">
        <div className="section-heading">
          <p>Frequently asked questions</p>
          <h2>Avid MCP, <em>clearly bounded.</em></h2>
          <span>
            Straight answers about supported formats, privacy, compatibility, and live editing. More questions are
            answered on the <a className="inline-link" href={pages.faq.path}>full FAQ</a>.
          </span>
        </div>
        <div>{faq.map(item => <details key={item.question}><summary>{item.question}<b>+</b></summary><p>{item.answer}</p></details>)}</div>
      </section>

      <section className="cta shell">
        <div>
          <p>Free <i /> Open source <i /> Local-first</p>
          <h2>Start with the project evidence.</h2>
          <ul className="cta-list">
            <li><CircleCheck /> Read-only by default</li>
            <li><CircleCheck /> Your media stays local</li>
            <li><CircleCheck /> MIT licensed on GitHub</li>
          </ul>
        </div>
        <div className="cta-actions">
          <a className="button primary" href={pages.setup.path}><Code2 /> Install the server</a>
          <a className="button secondary" href={repo} target="_blank" rel="noreferrer"><GitFork /> Explore on GitHub</a>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
