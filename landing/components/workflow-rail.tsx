"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, FileSearch, FolderSearch, ShieldCheck, SquareCheckBig } from "lucide-react"
import { useState, type ComponentType } from "react"

type Step = {
  id: string
  label: string
  tool: string
  badge: string
  title: string
  summary: string
  points: string[]
  Icon: ComponentType<{ className?: string }>
}

const steps: Step[] = [
  {
    id: "inventory",
    label: "Inventory the project",
    tool: "avid_inventory_project_files",
    badge: "Read-only · allowed roots enforced",
    title: "Inventory the project",
    summary: "Walk a project tree you explicitly allow and classify every project, bin, setting, lock, interchange and media file.",
    points: [
      "Nothing is read until an MCP client calls the tool on a configured allowed root.",
      "Active and orphaned .lck bin locks are reported before anyone opens the project.",
      "Optional SHA-256 hashing establishes a baseline for later comparison."
    ],
    Icon: FolderSearch
  },
  {
    id: "evidence",
    label: "Parse the evidence",
    tool: "avid_analyze_bin",
    badge: "Read-only · structured parsers",
    title: "Parse the evidence",
    summary: "Read AVB, AAF, ALE, EDL and OTIO structures directly instead of asking a model to infer state from Avid's interface.",
    points: [
      "pyavb and pyaaf2 expose mobs, slots, tracks, clips, sequences and metadata.",
      "Missing, malformed, truncated or opaque data is labeled, never guessed.",
      "ffprobe adds codec, container, timecode and stream evidence for linked media."
    ],
    Icon: FileSearch
  },
  {
    id: "preview",
    label: "Preview the plan",
    tool: "avid_preview_edit_plan",
    badge: "No mutation · risk classified",
    title: "Preview the plan",
    summary: "Turn a requested change into a bounded plan you can read first, with each step classified by risk before anything runs.",
    points: [
      "Preview validates the plan and returns an exact SHA-256 confirmation token.",
      "Destructive operations require explicit opt-in and are labeled as such.",
      "A previewed plan is a proposal — it never implies Media Composer performed it."
    ],
    Icon: SquareCheckBig
  },
  {
    id: "apply",
    label: "Confirm and apply",
    tool: "avid_apply_edit_plan",
    badge: "Guarded · fails closed",
    title: "Confirm and apply",
    summary: "Apply only the exact plan you confirmed, and only through a bridge that currently advertises every operation it needs.",
    points: [
      "The confirmation token must match the previewed plan byte for byte.",
      "No bridge, a stale heartbeat or an unadvertised operation means no live edit.",
      "Bridge state is reported explicitly instead of degrading to UI automation."
    ],
    Icon: ShieldCheck
  }
]

export function WorkflowRail() {
  const reduceMotion = useReducedMotion()
  const [active, setActive] = useState(0)
  const step = steps[active]
  const StepIcon = step.Icon

  return (
    <div className="workflow">
      <div className="workflow-rail" role="tablist" aria-label="Guarded workflow steps">
        {steps.map((item, index) => (
          <button
            type="button"
            role="tab"
            key={item.id}
            id={`workflow-tab-${item.id}`}
            aria-selected={index === active}
            aria-controls="workflow-panel"
            className={index === active ? "active" : ""}
            onClick={() => setActive(index)}
          >
            <b>{String(index + 1).padStart(2, "0")}</b>
            <span>
              <strong>{item.label}</strong>
              <code>{item.tool}</code>
            </span>
          </button>
        ))}
      </div>

      <div className="workflow-panel" id="workflow-panel" role="tabpanel" aria-labelledby={`workflow-tab-${step.id}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="workflow-tool">{step.tool}</p>
            <StepIcon />
            <h3>{step.title}</h3>
            <span className="workflow-badge">{step.badge}</span>
            <p className="workflow-summary">{step.summary}</p>
            <ul>
              {step.points.map(point => (
                <li key={point}><Check /> {point}</li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
