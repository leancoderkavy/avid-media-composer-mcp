"use client"

import { captureLanding, type CopyTarget } from "@/lib/telemetry"

import { Check, Copy } from "lucide-react"
import { useEffect, useState } from "react"

export function CopyButton({ value, label = "Copy", telemetryTarget }: { value: string; label?: string; telemetryTarget: CopyTarget }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      captureLanding("avid_landing_copy", telemetryTarget, "succeeded")
    } catch {
      setCopied(false)
      captureLanding("avid_landing_copy", telemetryTarget, "failed")
    }
  }

  return (
    <button type="button" className="copy-button" onClick={copy} aria-live="polite">
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </button>
  )
}
