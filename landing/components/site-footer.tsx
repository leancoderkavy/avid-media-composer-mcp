import { docs, lastUpdated, npmUrl, pages } from "@/lib/site"

export function SiteFooter() {
  return (
    <footer className="shell">
      <div className="brand"><span>Av</span> avid-media-composer-mcp</div>
      <p>Independent, open-source software for source-safe Avid project analysis and guarded automation.</p>
      <div>
        <a href={pages.tools.path}>Tools</a>
        <a href={pages.setup.path}>Setup</a>
        <a href={pages.faq.path}>FAQ</a>
        <a href={npmUrl}>npm</a>
        <a href={docs.security}>Security</a>
        <a href={docs.contributing}>Contributing</a>
        <a href={docs.license}>MIT License</a>
        <a href="/llms.txt">llms.txt</a>
      </div>
      <small>
        Not affiliated with or endorsed by Avid Technology, Inc. Avid and Media Composer are trademarks of Avid Technology, Inc.
        {" "}Content last reviewed <time dateTime={lastUpdated}>{lastUpdated}</time>.
      </small>
    </footer>
  )
}
