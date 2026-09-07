import { Fragment } from "react"

/**
 * Minimal inline renderer for guide copy: `code` spans and [label](href) links.
 * Content lives in lib/guides.ts as plain strings so it stays diffable and reusable
 * by the llms.txt routes; this keeps it out of dangerouslySetInnerHTML.
 */
const token = /(`[^`]+`|\[[^\]]+\]\([^)]+\))/g

export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(token).map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
        if (link) {
          const external = link[2].startsWith("http")
          return (
            <a key={i} className="inline-link" href={link[2]} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
              {link[1]}
            </a>
          )
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}

/** Strips inline markup so the same strings can be emitted as plain text for AI crawlers. */
export const plainText = (text: string) =>
  text.replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
