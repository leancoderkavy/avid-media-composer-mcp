import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { absoluteUrl, pages, repo, siteName, siteUrl } from "@/lib/site"

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] })
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] })
const title = pages.home.title
const description =
  "Source-safe MCP tools for Avid Media Composer project, AVB, AAF, ALE, EDL, lock, configuration, and media analysis with guarded editing automation."

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: `%s | ${siteName}` },
  description,
  verification: {
    google: "7_CWvFtMrOF4ll4pOAAGN0Qx1mo5ZkQOPSPEhjU5gmY"
  },
  applicationName: siteName,
  category: "developer tools",
  authors: [{ name: "Avid Media Composer MCP contributors", url: `${repo}/graphs/contributors` }],
  creator: "Avid Media Composer MCP contributors",
  publisher: siteName,
  keywords: [
    "Avid Media Composer MCP",
    "Avid MCP server",
    "Avid Media Composer AI",
    "Model Context Protocol",
    "AVB analysis",
    "AAF analysis",
    "ALE parser",
    "EDL parser",
    "AI video editing",
    "Avid project analysis",
    "post-production automation",
    "Claude Avid integration",
    "Avid AAF MCP",
    "Avid AVB parser",
    "Avid Media Composer automation"
  ],
  alternates: { canonical: "/", types: { "text/plain": [{ url: absoluteUrl("/llms.txt"), title: "llms.txt" }] } },
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName,
    locale: "en_US",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Avid Media Composer MCP — source-safe project intelligence for AI" }]
  },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 }
  }
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  )
}
