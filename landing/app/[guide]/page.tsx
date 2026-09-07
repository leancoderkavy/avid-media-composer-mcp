import type { Metadata } from "next"
import { ArrowRight, ShieldCheck } from "lucide-react"
import { notFound } from "next/navigation"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { JsonLd } from "@/components/json-ld"
import { RichText } from "@/components/rich-text"
import { SiteFooter } from "@/components/site-footer"
import { SiteNav } from "@/components/site-nav"
import { guideBySlug, guidePath, guides } from "@/lib/guides"
import { absoluteUrl, breadcrumbs, lastUpdated, ogImage, pages, repo } from "@/lib/site"

type Params = { params: Promise<{ guide: string }> }

export const dynamicParams = false

export function generateStaticParams() {
  return guides.map(guide => ({ guide: guide.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { guide: slug } = await params
  const guide = guideBySlug.get(slug)
  if (!guide) return {}
  return {
    title: { absolute: guide.metaTitle },
    description: guide.description,
    keywords: guide.keywords,
    alternates: { canonical: guidePath(guide.slug) },
    openGraph: {
      title: guide.metaTitle,
      description: guide.description,
      url: absoluteUrl(guidePath(guide.slug)),
      type: "article",
      modifiedTime: lastUpdated,
      images: [ogImage]
    },
    twitter: { card: "summary_large_image", title: guide.metaTitle, description: guide.description, images: [ogImage.url] }
  }
}

export default async function GuidePage({ params }: Params) {
  const { guide: slug } = await params
  const guide = guideBySlug.get(slug)
  if (!guide) notFound()

  const url = absoluteUrl(guidePath(guide.slug))
  const crumbs = [{ name: guide.navLabel, path: guidePath(guide.slug) }]
  const related = guides.filter(other => other.slug !== guide.slug).slice(0, 3)

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbs(crumbs),
      {
        "@type": "TechArticle",
        "@id": `${url}#article`,
        headline: guide.metaTitle,
        description: guide.description,
        abstract: guide.answer.replace(/`/g, ""),
        url,
        dateModified: lastUpdated,
        inLanguage: "en-US",
        keywords: guide.keywords,
        about: { "@id": absoluteUrl("/#software") },
        isPartOf: { "@id": absoluteUrl("/#website") },
        mentions: guide.tools.map(name => ({
          "@type": "SoftwareApplication",
          name,
          applicationCategory: "DeveloperApplication",
          url: absoluteUrl(`${pages.tools.path}#${name}`)
        }))
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        url,
        dateModified: lastUpdated,
        inLanguage: "en-US",
        mainEntity: guide.faq.map(item => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer }
        }))
      }
    ]
  }

  return (
    <main>
      <JsonLd data={structuredData} />
      <SiteNav />
      <section className="page shell">
        <Breadcrumbs items={crumbs} />
        <div className="section-heading">
          <p>{guide.eyebrow}</p>
          <h1>{guide.h1} <em>{guide.h1Accent}</em></h1>
          <span><RichText text={guide.answer} /></span>
        </div>

        {guide.sections.map(section => (
          <section className="tool-group" key={section.h2}>
            <h2>{section.h2}</h2>
            {section.body?.map(paragraph => (
              <p key={paragraph}><RichText text={paragraph} /></p>
            ))}
            {section.list && (
              <ul className="plain-list">
                {section.list.map(item => <li key={item}><RichText text={item} /></li>)}
              </ul>
            )}
            {section.table && (
              <div className="table-wrap">
                <table>
                  <thead><tr>{section.table.head.map(cell => <th key={cell}>{cell || " "}</th>)}</tr></thead>
                  <tbody>
                    {section.table.rows.map(row => (
                      <tr key={row.join("|")}>
                        {row.map((cell, i) => <td key={i}><RichText text={cell} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}

        <section className="tool-group">
          <h2>MCP tools for this</h2>
          <p>
            The open-source <a className="inline-link" href={repo}>Avid Media Composer MCP server</a> exposes these tools to
            any MCP-compatible AI client. Every one of them is read-only.
          </p>
          <ul className="plain-list">
            {guide.tools.map(name => (
              <li key={name}>
                <a className="inline-link" href={`${pages.tools.path}#${name}`}><code>{name}</code></a>
              </li>
            ))}
          </ul>
          <p className="actions">
            <a className="button primary" href={pages.setup.path}>Install the server <ArrowRight /></a>
            <a className="button secondary" href={pages.tools.path}>All tools</a>
          </p>
        </section>

        <section className="tool-group">
          <h2>Frequently asked questions</h2>
          <div className="faq-list">
            {guide.faq.map(item => (
              <details key={item.question} open>
                <summary><h3>{item.question}</h3><b>+</b></summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="tool-group">
          <h2>Related guides</h2>
          <ul className="plain-list">
            {related.map(other => (
              <li key={other.slug}>
                <a className="inline-link" href={guidePath(other.slug)}>{other.metaTitle}</a>
              </li>
            ))}
          </ul>
        </section>

        <p className="boundary">
          <ShieldCheck /> This page documents an independent open-source project. It is not affiliated with or endorsed by
          Avid Technology, Inc. Behaviour described for the MCP server reflects the published package; confirm format and
          application details against Avid&apos;s own documentation before relying on them in production.
        </p>
      </section>
      <SiteFooter />
    </main>
  )
}
