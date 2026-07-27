import { ImageResponse } from "next/og"

export const alt = "Avid Media Composer MCP — source-safe project intelligence for AI"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const dynamic = "force-static"

export default function Image() {
  return new ImageResponse(
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      justifyContent: "space-between", padding: "72px", color: "white",
      background: "radial-gradient(circle at 75% 20%, #4338ca 0, #17132d 28%, #050507 64%)",
      fontFamily: "Arial, sans-serif"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 28, color: "#c4b5fd" }}>
        <div style={{ display: "flex", width: 58, height: 58, alignItems: "center", justifyContent: "center", borderRadius: 12, border: "1px solid #6d5bd0", background: "#34275b" }}>Av</div>
        avid-media-composer-mcp
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 76, lineHeight: 1.02, fontWeight: 700, letterSpacing: "-3px", maxWidth: 950 }}>
          Source-safe Avid project intelligence for AI.
        </div>
        <div style={{ marginTop: 30, fontSize: 28, color: "#a1a1aa" }}>AVB · AAF · ALE · EDL · media · guarded automation</div>
      </div>
    </div>,
    size
  )
}
