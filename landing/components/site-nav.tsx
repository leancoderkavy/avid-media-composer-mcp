import { ArrowRight } from "lucide-react"
import { pages, repo } from "@/lib/site"

export function SiteNav() {
  return (
    <header className="nav">
      <nav className="shell nav-inner" aria-label="Primary navigation">
        <a className="brand" href={pages.home.path}><span>Av</span> avid-media-composer-mcp</a>
        <div className="nav-links">
          <a href={pages.tools.path}>Tools</a>
          <a href={pages.setup.path}>Setup</a>
          <a href={pages.faq.path}>FAQ</a>
          <a href={`${pages.home.path}#capabilities`}>Capabilities</a>
          <a className="github-link" href={repo} target="_blank" rel="noreferrer">GitHub <ArrowRight /></a>
        </div>
      </nav>
    </header>
  )
}
