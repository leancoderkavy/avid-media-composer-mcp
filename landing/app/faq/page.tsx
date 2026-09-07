import type { Metadata } from "next"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { JsonLd } from "@/components/json-ld"
import { SiteFooter } from "@/components/site-footer"
import { SiteNav } from "@/components/site-nav"
import { extendedFaq } from "@/lib/faq"
import { absoluteUrl, breadcrumbs, docs, lastUpdated, pages } from "@/lib/site"

const description =
  "Answers about the Avid Media Composer MCP server: supported formats, AI clients, installation, safety, live editing, HTTP transport, privacy and Avid version compatibility."

export const metadata: Metadata = {
  title: { absolute: "Avid Media Composer MCP FAQ: Formats, Clients, Safety" },
  description,
  alternates: { canonical: pages.faq.path },
  openGraph: { title: pages.faq.title, description, url: absoluteUrl(pages.faq.path), type: "article" }
}

const crumbs = [{ name: "FAQ", path: pages.faq.path }]

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    breadcrumbs(crumbs),
    {
      "@type": "FAQPage",
      "@id": absoluteUrl(`${pages.faq.path}#faq`),
      url: absoluteUrl(pages.faq.path),
      dateModified: lastUpdated,
      inLanguage: "en-US",
      mainEntity: extendedFaq.map(item => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer }
      }))
    }
  ]
}

export default function FaqPage() {
  return (
    <main>
      <JsonLd data={structuredData} />
      <SiteNav />
      <section className="page shell">
        <Breadcrumbs items={crumbs} />
        <div className="section-heading">
          <p>Frequently asked questions</p>
          <h1>Avid Media Composer MCP, <em>answered.</em></h1>
          <span>Straight answers about formats, AI clients, installation, safety, live editing and compatibility. Every answer reflects demonstrated behavior in the open-source repository.</span>
        </div>
        <div className="faq-list">
          {extendedFaq.map(item => (
            <details key={item.question} open>
              <summary><h2>{item.question}</h2><b>+</b></summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
        <div className="prose">
          <h2>Still have a question?</h2>
          <p>
            Read the <a href={docs.readme}>README</a>, the <a href={docs.capabilityMatrix}>capability matrix</a> and the{" "}
            <a href={docs.security}>security policy</a>, or open a structured issue on GitHub. For installation see the{" "}
            <a href={pages.setup.path}>setup guide</a>; for the tool list see the <a href={pages.tools.path}>tool reference</a>.
          </p>
        </div>
      </section>
      <SiteFooter />
    </main>
  )
}
