import type { Metadata } from "next"
import { ShieldCheck } from "lucide-react"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { JsonLd } from "@/components/json-ld"
import { SiteFooter } from "@/components/site-footer"
import { SiteNav } from "@/components/site-nav"
import { absoluteUrl, breadcrumbs, docs, lastUpdated, npmUrl, pages, repo } from "@/lib/site"

const description =
  "Install the Avid Media Composer MCP server with npx, set allowed project roots, and connect Claude Desktop, Claude Code, Cursor, VS Code, Codex or LM Studio in a few minutes."

export const metadata: Metadata = {
  title: { absolute: "Install the Avid Media Composer MCP Server: Setup Guide" },
  description,
  alternates: { canonical: pages.setup.path },
  openGraph: { title: pages.setup.title, description, url: absoluteUrl(pages.setup.path), type: "article" }
}

const crumbs = [{ name: "Setup", path: pages.setup.path }]

const steps = [
  {
    name: "Install the prerequisites",
    text: "Install Node.js 20 or newer. For AVB and AAF analysis install Python 3.9 or newer with the pinned pyavb and pyaaf2 packages from python/requirements.txt. Put ffprobe on PATH for clip analysis."
  },
  {
    name: "Set allowed project roots",
    text: "Set AVID_MCP_ALLOWED_ROOTS to the Avid project folders the server may read and AVID_MCP_CAPABILITIES to inspect. The server refuses paths outside allowed roots."
  },
  {
    name: "Run the server",
    text: "Run npx -y avid-media-composer-mcp@latest for the local stdio transport, or npm run start:http with MCP_AUTH_TOKEN for the authenticated Streamable HTTP transport."
  },
  {
    name: "Connect your MCP client",
    text: "Add the server to your client configuration. The CLI prints ready-made JSON for claude, cursor, vscode, lmstudio and generic clients and an argument array for codex."
  },
  {
    name: "Verify with a read-only call",
    text: "Ask the client to call avid_ping and avid_get_capabilities, then avid_analyze_project on one allowed root. Reports separate parsed evidence, opaque files, lock risks and unavailable dependencies."
  }
]

const clientConfig = `{
  "mcpServers": {
    "avid-media-composer": {
      "command": "npx",
      "args": ["-y", "avid-media-composer-mcp@latest"],
      "env": {
        "AVID_MCP_ALLOWED_ROOTS": "C:\\\\Users\\\\you\\\\Documents\\\\Avid Projects",
        "AVID_MCP_CAPABILITIES": "inspect"
      }
    }
  }
}`

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    breadcrumbs(crumbs),
    {
      "@type": "HowTo",
      "@id": absoluteUrl(`${pages.setup.path}#howto`),
      name: "How to install the Avid Media Composer MCP server",
      description,
      url: absoluteUrl(pages.setup.path),
      dateModified: lastUpdated,
      inLanguage: "en-US",
      totalTime: "PT10M",
      tool: [{ "@type": "HowToTool", name: "Node.js 20 or newer" }, { "@type": "HowToTool", name: "Python 3.9 or newer (optional, AVB/AAF)" }, { "@type": "HowToTool", name: "ffprobe (optional, media)" }],
      supply: [{ "@type": "HowToSupply", name: "An MCP-compatible AI client" }],
      step: steps.map((step, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: step.name,
        text: step.text,
        url: absoluteUrl(`${pages.setup.path}#step-${i + 1}`)
      })),
      about: { "@id": absoluteUrl("/#software") }
    }
  ]
}

export default function SetupPage() {
  return (
    <main>
      <JsonLd data={structuredData} />
      <SiteNav />
      <section className="page shell">
        <Breadcrumbs items={crumbs} />
        <div className="section-heading">
          <p>Local setup</p>
          <h1>Install the Avid Media Composer <em>MCP server.</em></h1>
          <span>
            The server runs beside your Avid project on Windows or macOS. It reads only the roots you allow and starts
            in inspect-only mode. Most setups take about ten minutes.
          </span>
        </div>

        <div className="prose">
          <h2>Requirements</h2>
          <ul className="plain-list">
            <li>Node.js 20 or newer.</li>
            <li>Python 3.9 or newer for AVB and AAF analysis, with the pinned packages from <code>python/requirements.txt</code>.</li>
            <li><code>ffprobe</code> on <code>PATH</code> for clip analysis.</li>
            <li>A compatible Avid Extension bridge only if you need guarded live editing. See the <a href={docs.bridge}>bridge contract</a>.</li>
          </ul>

          <h2>Step-by-step</h2>
          <ol className="steps">
            {steps.map((step, i) => (
              <li key={step.name} id={`step-${i + 1}`}>
                <b>{i + 1}</b>
                <span><strong>{step.name}</strong><small>{step.text}</small></span>
              </li>
            ))}
          </ol>

          <h2>Run the published package</h2>
          <pre><code><span className="muted"># PowerShell</span>{"\n"}$env:AVID_MCP_ALLOWED_ROOTS = &quot;C:\Users\you\Documents\Avid Projects&quot;{"\n"}$env:AVID_MCP_CAPABILITIES = &quot;inspect&quot;{"\n"}npx -y avid-media-composer-mcp@latest</code></pre>
          <pre><code><span className="muted"># macOS / Linux shell</span>{"\n"}export AVID_MCP_ALLOWED_ROOTS=&quot;$HOME/Documents/Avid Projects&quot;{"\n"}export AVID_MCP_CAPABILITIES=inspect{"\n"}npx -y avid-media-composer-mcp@latest</code></pre>

          <h2>Client configuration</h2>
          <p>
            Claude Desktop, Claude Code, Cursor, VS Code and LM Studio accept the JSON shape below. Run{" "}
            <code>avid-mcp --client claude --root &quot;ABSOLUTE_PROJECT_PATH&quot;</code> to print configuration for a specific
            client, or <code>--client codex</code> for a Codex argument array.
          </p>
          <pre><code>{clientConfig}</code></pre>

          <h2>Authenticated HTTP transport</h2>
          <p>
            For a remote or containerized client, set <code>MCP_AUTH_TOKEN</code> to a strong random value and run{" "}
            <code>npm run start:http</code>. The MCP endpoint is <code>/mcp</code>. Every request requires{" "}
            <code>Authorization: Bearer &lt;token&gt;</code>. <code>/health</code> is unauthenticated for provider health checks.
          </p>

          <h2>Enable guarded editing later</h2>
          <p>
            Start with <code>inspect</code>. After installing and testing a compatible Extension bridge, set{" "}
            <code>AVID_MCP_CAPABILITIES</code> to <code>inspect,edit</code>, point <code>AVID_MCP_BRIDGE_DIR</code> at the
            bridge mailbox, and configure a shared <code>AVID_MCP_BRIDGE_AUTH_SECRET</code> of at least 32 characters. Keep
            that secret out of project files, logs and source control.
          </p>

          <h2>Next steps</h2>
          <ul className="plain-list">
            <li>Browse the <a href={pages.tools.path}>tool reference</a>.</li>
            <li>Read the <a href={docs.localSetup}>development-branch local setup</a> for native Windows operations and managed Python environments.</li>
            <li>Install the bundled <a href={docs.workflowSkills}>workflow skills</a> for ingest QC, selects, review markers, turnover and export.</li>
            <li>Check the <a href={npmUrl}>npm package</a> and <a href={docs.changelog}>changelog</a> for the current release.</li>
          </ul>
        </div>

        <p className="boundary">
          <ShieldCheck /> Offline analysis is read-only and never modifies source media. Generated client configuration does not
          prove application onboarding; verify with a read-only call. Source and evidence live in the{" "}
          <a className="inline-link" href={repo}>GitHub repository</a>.
        </p>
      </section>
      <SiteFooter />
    </main>
  )
}
