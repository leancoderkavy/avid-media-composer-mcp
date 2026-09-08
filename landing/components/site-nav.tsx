import { ArrowRight } from "lucide-react"
import { docs, pages, repo } from "@/lib/site"

const links = [
  { label: "Demo", href: `${pages.home.path}#demo` },
  { label: "Workflow", href: `${pages.home.path}#workflow` },
  { label: "Capabilities", href: `${pages.home.path}#capabilities` },
  { label: "Connect", href: `${pages.home.path}#connect` },
  { label: "Guides", href: `${pages.home.path}#guides` },
  { label: "Tools", href: pages.tools.path },
  { label: "Setup", href: pages.setup.path },
  { label: "FAQ", href: pages.faq.path },
  { label: "Docs", href: docs.readme }
]

export function SiteNav() {
  return (
    <header className="nav">
      <nav className="shell nav-inner" aria-label="Primary navigation">
        <a className="brand" href={pages.home.path}><span>Av</span> avid-media-composer-mcp</a>
        <div className="nav-links">
          {links.map(link => <a key={link.label} href={link.href}>{link.label}</a>)}
          <a className="github-link" href={repo} target="_blank" rel="noreferrer">GitHub <ArrowRight /></a>
        </div>
      </nav>
    </header>
  )
}
