import type { MetadataRoute } from "next"
import { absoluteUrl, lastUpdated, pages } from "@/lib/site"

export const dynamic = "force-static"

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(lastUpdated)
  return [
    { url: absoluteUrl(pages.home.path), lastModified, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl(pages.tools.path), lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl(pages.setup.path), lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl(pages.faq.path), lastModified, changeFrequency: "monthly", priority: 0.7 }
  ]
}
