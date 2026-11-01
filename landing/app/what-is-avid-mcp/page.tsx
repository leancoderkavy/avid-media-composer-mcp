import type { Metadata } from "next"
import { ArrowRight, BookOpen, CircleCheck, Code2, FileSearch, GitFork, ShieldCheck, Zap } from "lucide-react"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { JsonLd } from "@/components/json-ld"
import { SiteFooter } from "@/components/site-footer"
import { SiteNav } from "@/components/site-nav"
import { absoluteUrl, breadcrumbs, docs, lastUpdated, npmUrl, ogImage, pages, repo, siteUrl } from "@/lib/site"

const description =
  "Avid Media Composer MCP is an open-source server that lets AI assistants like Claude and ChatGPT read Avid projects, bins, and editorial files directly. Learn what it does, who it's for, and how to get started."

export const metadata: Metadata = {
  title: { absolute: "What Is Avid Media Composer MCP? | AI Project Analysis" },
  description,
  alternates: { canonical: "/what-is-avid-mcp/" },
  openGraph: { title: "What Is Avid Media Composer MCP?", description, url: absoluteUrl("/what-is-avid-mcp/"), type: "article", images: [ogImage] },
  twitter: { card: "summary_large_image", title: "What Is Avid Media Composer MCP?", description, images: [ogImage.url] },
  keywords: [
    "what is avid mcp",
    "avid media composer mcp explained",
    "avid mcp server",
    "model context protocol avid",
    "ai for avid media composer",
    "avid project analysis ai",
    "claude avid integration",
    "chatgpt avid media composer"
  ]
}

const crumbs = [{ name: "What is Avid MCP", path: "/what-is-avid-mcp/" }]

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    breadcrumbs(crumbs),
    {
      "@type": "Article",
      "@id": absoluteUrl("/what-is-avid-mcp/#article"),
      headline: "What Is Avid Media Composer MCP?",
      description,
      url: absoluteUrl("/what-is-avid-mcp/"),
      datePublished: "2026-09-07",
      dateModified: lastUpdated,
      author: { "@type": "Organization", name: "Avid Media Composer MCP contributors" },
      publisher: { "@type": "Organization", name: "Avid Media Composer MCP", url: siteUrl },
      mainEntityOfPage: absoluteUrl("/what-is-avid-mcp/"),
      inLanguage: "en-US"
    },
    {
      "@type": "HowTo",
      "@id": absoluteUrl("/what-is-avid-mcp/#howto"),
      name: "How to use Avid Media Composer MCP",
      description: "Connect AI assistants to Avid Media Composer projects for automated analysis",
      step: [
        {
          "@type": "HowToStep",
          position: 1,
          name: "Install prerequisites",
          text: "Install Node.js 20+ and optionally Python 3.9+ for AVB/AAF analysis"
        },
        {
          "@type": "HowToStep",
          position: 2,
          name: "Install the MCP server",
          text: "Run npx -y avid-media-composer-mcp@latest with allowed project roots configured"
        },
        {
          "@type": "HowToStep",
          position: 3,
          name: "Connect your AI client",
          text: "Add the server configuration to Claude, Cursor, VS Code, or another MCP-compatible client"
        },
        {
          "@type": "HowToStep",
          position: 4,
          name: "Ask questions",
          text: "Query your Avid projects, bins, AAF, ALE, and EDL files using natural language"
        }
      ]
    }
  ]
}

const useCases = [
  {
    title: "Project audits before conform",
    description: "Scan an Avid project tree, identify active and orphaned bin locks, validate interchange files, and catch missing media or malformed structures before anyone opens an NLE."
  },
  {
    title: "AAF, ALE, and EDL validation",
    description: "Parse AAF, ALE, and CMX-style EDL files for structural errors, missing reels, rate mismatches, and unsupported effects — all without opening Media Composer or another application."
  },
  {
    title: "Metadata extraction and reporting",
    description: "Pull clip names, timecode, markers, sequence structure, and custom bin columns from AVB bins and AAF files to generate reports, track changes, or feed downstream systems."
  },
  {
    title: "Pre-archive and migration checks",
    description: "Inventory project files with checksums, verify interchange file integrity, and document project structure before long-term storage or facility migration."
  },
  {
    title: "Compatibility screening",
    description: "Check whether a Media Composer version, OS, and architecture combination is qualified according to Avid's official compatibility matrix."
  },
  {
    title: "Automated QA workflows",
    description: "Integrate with CI/CD pipelines to validate deliverables, check file completeness, and enforce post-production standards without manual inspection."
  }
]

const whoItsFor = [
  {
    role: "Post-production supervisors",
    benefit: "Audit projects and deliverables at scale without opening every bin manually."
  },
  {
    role: "Assistant editors",
    benefit: "Validate interchange files, check lock status, and generate metadata reports in seconds."
  },
  {
    role: "Conform and finishing editors",
    benefit: "Inspect AAF, EDL, and ALE files for structural issues before starting a conform."
  },
  {
    role: "Pipeline developers",
    benefit: "Build automated workflows that read Avid projects as structured data rather than screen scraping."
  },
  {
    role: "Archivists and data wranglers",
    benefit: "Document project structure, verify file integrity, and prepare metadata for long-term storage."
  },
  {
    role: "Technical directors",
    benefit: "Screen workstation configurations and diagnose integration issues programmatically."
  }
]

export default function WhatIsAvidMcpPage() {
  return (
    <main>
      <JsonLd data={structuredData} />
      <SiteNav />
      <section className="page shell">
        <Breadcrumbs items={crumbs} />
        <div className="section-heading">
          <p>Understanding Avid MCP</p>
          <h1>
            What is <em>Avid Media Composer MCP?</em>
          </h1>
          <span>
            An open-source server that connects AI assistants to Avid Media Composer projects. Read bins, analyze
            interchange files, and audit project trees — all without opening the application.
          </span>
        </div>

        <div className="prose">
          <h2>The short answer</h2>
          <p>
            <strong>Avid Media Composer MCP</strong> is an open-source{" "}
            <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer">
              Model Context Protocol
            </a>{" "}
            server that gives AI assistants like Claude, ChatGPT, and Cursor read-only access to Avid Media Composer
            projects. It parses AVB bins, AAF files, ALE logs, EDL cut lists, and project metadata directly from disk —
            no Media Composer application required.
          </p>
          <p>
            You install it locally, point it at your Avid project folders, and connect it to an MCP-compatible AI
            client. The assistant can then answer questions about your projects, validate deliverables, and audit
            editorial files using natural language.
          </p>

          <div className="callout">
            <CircleCheck />
            <div>
              <strong>Read-only by design</strong>
              <p>
                Offline analysis never modifies project files or source media. Guarded live editing requires a
                separately installed Avid Extension bridge.
              </p>
            </div>
          </div>

          <h2>Why it exists</h2>
          <p>
            Avid Media Composer projects are directories of proprietary binary files. Understanding what's in them —
            which bins are locked, what sequences exist, whether an AAF will conform cleanly — normally requires opening
            Media Composer, loading each bin, and inspecting them one by one.
          </p>
          <p>
            That's slow, error-prone, and impossible to automate at scale. Post supervisors audit dozens of projects.
            Conform editors check interchange files from multiple facilities. Pipeline developers need structured
            project data for tracking and reporting.
          </p>
          <p>
            Avid Media Composer MCP solves this by parsing those files directly and exposing their contents as
            structured tools an AI assistant can call. Ask "Which bins in this project contain sequences over 10
            minutes?" or "Does this AAF have missing media?" and get accurate answers in seconds — no manual inspection
            required.
          </p>

          <h2>What it actually does</h2>
          <div className="feature-grid">
            <article>
              <FileSearch />
              <h3>Project and bin analysis</h3>
              <p>
                Inventory project trees, classify files by type, detect active and orphaned bin locks, and parse AVB
                bins to extract clips, sequences, tracks, markers, and metadata through the open-source pyavb library.
              </p>
            </article>
            <article>
              <BookOpen />
              <h3>Interchange file validation</h3>
              <p>
                Parse AAF, ALE, and CMX-style EDL files for structural errors, missing columns, malformed events, rate
                mismatches, and unsupported effects before anyone opens them in an NLE.
              </p>
            </article>
            <article>
              <Zap />
              <h3>Media metadata inspection</h3>
              <p>
                Use ffprobe to extract codec, container, duration, frame rate, timecode, audio channels, and stream
                metadata from MXF, MOV, and other media files referenced by your projects.
              </p>
            </article>
            <article>
              <ShieldCheck />
              <h3>Compatibility screening</h3>
              <p>
                Check Media Composer version, OS, and CPU architecture combinations against Avid's official
                qualification matrix to screen workstation configurations before deployment.
              </p>
            </article>
            <article>
              <Code2 />
              <h3>Guarded edit previews</h3>
              <p>
                Preview bounded editing plans, classify operations by risk, and require exact SHA-256 confirmation
                tokens before any live Media Composer changes can be applied through an Extension bridge.
              </p>
            </article>
            <article>
              <GitFork />
              <h3>Source-safe automation</h3>
              <p>
                Enforce explicit allowed roots so the server cannot read outside designated project folders. Report
                opaque data as labeled evidence instead of guessing, and fail closed when dependencies are unavailable.
              </p>
            </article>
          </div>

          <h2>Common use cases</h2>
          <div className="use-cases">
            {useCases.map(useCase => (
              <details key={useCase.title} open>
                <summary>
                  <h3>{useCase.title}</h3>
                </summary>
                <p>{useCase.description}</p>
              </details>
            ))}
          </div>

          <h2>Who it's for</h2>
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>How they use it</th>
              </tr>
            </thead>
            <tbody>
              {whoItsFor.map(entry => (
                <tr key={entry.role}>
                  <td>
                    <strong>{entry.role}</strong>
                  </td>
                  <td>{entry.benefit}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>What it is not</h2>
          <ul>
            <li>
              <strong>Not a replacement for Media Composer.</strong> It reads project files and provides analysis. It
              does not edit timelines, render effects, or transcode media.
            </li>
            <li>
              <strong>Not a cloud service.</strong> The server runs locally on your workstation beside your project
              files. Your media and project data never leave your machine unless you explicitly configure remote HTTP
              transport.
            </li>
            <li>
              <strong>Not UI automation or screen scraping.</strong> It parses structured project data directly from
              AVB, AAF, ALE, and EDL files. It never drives the Media Composer user interface or simulates mouse and
              keyboard input.
            </li>
            <li>
              <strong>Not a general-purpose editor API.</strong> Avid Media Composer has no public scripting API. Live
              timeline editing through this MCP server requires a separately installed, compatible Avid Extension bridge
              that must advertise each operation.
            </li>
          </ul>

          <h2>How it works</h2>
          <p>
            The Model Context Protocol (MCP) is an open standard for connecting AI assistants to tools and data sources.
            Think of it as a structured way for Claude, ChatGPT, or Cursor to call functions on your behalf.
          </p>
          <p>
            Avid Media Composer MCP implements this protocol as a local stdio server. You configure it with allowed
            project roots, add it to your AI client's MCP settings, and restart the client. From that point on, the
            assistant has access to a set of tools like <code>avid_analyze_project</code>,{" "}
            <code>avid_analyze_bin</code>, <code>avid_analyze_aaf</code>, and <code>avid_inventory_project_files</code>
            .
          </p>
          <p>
            When you ask a question like "Which bins in Show_A are locked?", the assistant translates that into tool
            calls, the MCP server reads the project files, and the structured results flow back to the assistant for
            interpretation. You see the answer in plain language; the parsing happens behind the scenes.
          </p>

          <div className="callout">
            <ShieldCheck />
            <div>
              <strong>Privacy and safety</strong>
              <p>
                The server runs on your machine. It reads only the folders you explicitly allow via
                AVID_MCP_ALLOWED_ROOTS. Optional telemetry is disabled by default and never includes prompts, file
                paths, or project names.
              </p>
            </div>
          </div>

          <h2>Getting started</h2>
          <ol>
            <li>
              Install <strong>Node.js 20 or newer</strong>.
            </li>
            <li>
              Set <code>AVID_MCP_ALLOWED_ROOTS</code> to your Avid project folder and{" "}
              <code>AVID_MCP_CAPABILITIES</code> to <code>inspect</code>.
            </li>
            <li>
              Run <code>npx -y avid-media-composer-mcp@latest</code> to launch the server.
            </li>
            <li>Add the server configuration to your AI client (Claude, Cursor, VS Code, etc.).</li>
            <li>
              Ask the assistant to call <code>avid_ping</code> and <code>avid_get_capabilities</code> to verify the
              connection.
            </li>
            <li>
              Point it at a project with <code>avid_analyze_project</code> and see what it finds.
            </li>
          </ol>
          <p>
            For detailed setup instructions, Python dependencies, and client-specific configuration, see the{" "}
            <a href={pages.setup.path}>setup guide</a>.
          </p>

          <h2>What comes next</h2>
          <p>
            The current release provides read-only analysis of projects, bins, interchange files, and media metadata. A
            development branch adds local media intelligence (transcription, speaker workflows, visual search), saved
            snapshot inspection, and guarded native operations on qualified Windows builds.
          </p>
          <p>
            Live timeline editing through an Avid Extension bridge is protocol-defined and tested but requires a
            compatible extension installed on the host. Until that bridge exists, live operations fail closed.
          </p>
          <p>
            See the <a href={docs.implementationStatus}>implementation status</a> for what works today, the{" "}
            <a href={docs.capabilityMatrix}>capability matrix</a> for the full tool list, and the{" "}
            <a href={docs.bridge}>bridge contract</a> for the extension integration path.
          </p>

          <div className="cta-band">
            <div>
              <h2>Start reading your Avid projects with AI</h2>
              <p>
                Free, open source, and local-first. Install in about 10 minutes and connect the AI assistant you already
                use.
              </p>
            </div>
            <div className="cta-actions">
              <a className="button primary" href={pages.setup.path}>
                <Code2 /> Install the server
              </a>
              <a className="button secondary" href={docs.readme} target="_blank" rel="noreferrer">
                <FileSearch /> Read the docs
              </a>
            </div>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  )
}
