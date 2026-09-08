import { guidePath, guides } from "@/lib/guides"
import { docs, lastUpdated, npmUrl, pages, repo } from "@/lib/site"

const product = [
  { label: "Demo", href: `${pages.home.path}#demo` },
  { label: "Workflow", href: `${pages.home.path}#workflow` },
  { label: "Capabilities", href: `${pages.home.path}#capabilities` },
  { label: "Connect a client", href: `${pages.home.path}#connect` },
  { label: "Tool reference", href: pages.tools.path },
  { label: "Setup guide", href: pages.setup.path },
  { label: "FAQ", href: pages.faq.path }
]

const resources = [
  { label: "GitHub", href: repo },
  { label: "npm package", href: npmUrl },
  { label: "Documentation", href: docs.readme },
  { label: "Capability matrix", href: docs.capabilityMatrix },
  { label: "Supported versions", href: docs.supportedVersions },
  { label: "Security policy", href: docs.security },
  { label: "Changelog", href: docs.changelog },
  { label: "MIT License", href: docs.license },
  { label: "llms.txt", href: "/llms.txt" }
]

export function SiteFooter() {
  return (
    <footer className="shell">
      <div className="footer-brand">
        <div className="brand"><span>Av</span> avid-media-composer-mcp</div>
        <p>
          Independent, open-source, local-first MCP tooling for source-safe Avid Media Composer project analysis and
          guarded editing automation.
        </p>
      </div>

      <div className="footer-cols">
        <div>
          <h2>Product</h2>
          {product.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}
        </div>
        <div>
          <h2>Guides</h2>
          {guides.map(guide => <a key={guide.slug} href={guidePath(guide.slug)}>{guide.navLabel}</a>)}
        </div>
        <div>
          <h2>Resources</h2>
          {resources.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}
        </div>
      </div>

      <small>
        © {new Date().getFullYear()} avid-media-composer-mcp contributors. MIT licensed. Not affiliated with or endorsed
        by Avid Technology, Inc. Avid, Media Composer and MediaCentral are trademarks of Avid Technology, Inc.
        {" "}Content last reviewed <time dateTime={lastUpdated}>{lastUpdated}</time>.
      </small>
    </footer>
  )
}
