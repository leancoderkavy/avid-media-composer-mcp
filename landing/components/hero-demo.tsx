"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, CircleAlert, FileText, Folder, Pause, Play, RotateCcw, Search, Sparkles } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

const scenes = [
  {
    eyebrow: "Project connected",
    title: "Episode_101",
    detail: "Scanning project structure and bin locks",
    status: "Indexing 184 project files",
  },
  {
    eyebrow: "Bin intelligence",
    title: "Selects.avb",
    detail: "42 clips · 3 sequences · 7 tracks",
    status: "AVB object graph parsed",
  },
  {
    eyebrow: "Turnover check",
    title: "Picture_Lock_v12",
    detail: "AAF, ALE, EDL, and media evidence reconciled",
    status: "Audit ready for review",
  },
]

const sceneDuration = 3400

export function HeroDemo() {
  const reduceMotion = useReducedMotion()
  const [scene, setScene] = useState(0)
  const [playing, setPlaying] = useState(!reduceMotion)
  const [run, setRun] = useState(0)

  const next = useCallback(() => {
    setScene((current) => (current + 1) % scenes.length)
    setRun((current) => current + 1)
  }, [])

  useEffect(() => {
    if (!playing || reduceMotion) return
    const timer = window.setTimeout(next, sceneDuration)
    return () => window.clearTimeout(timer)
  }, [next, playing, reduceMotion, run, scene])

  function replay() {
    setScene(0)
    setPlaying(!reduceMotion)
    setRun((current) => current + 1)
  }

  const current = scenes[scene]

  return (
    <div className="demo-shell" aria-label="Animated Avid project audit demonstration">
      <div className="demo-topbar">
        <div className="demo-brand">
          <span className="demo-mark">Av</span>
          <span>Episode_101</span>
          <small>Project audit</small>
        </div>
        <div className="demo-status"><i /> MCP connected</div>
      </div>

      <div className="demo-workspace">
        <aside className="demo-sidebar">
          <div className="demo-search"><Search /><span>Search project</span></div>
          <p>PROJECT</p>
          {[
            ["01", "Sequences", "4"],
            ["02", "Selects", "42"],
            ["03", "Interchange", "6"],
          ].map(([id, label, count], index) => (
            <div className={`demo-bin ${scene === index ? "active" : ""}`} key={id}>
              <Folder /><span>{label}</span><small>{count}</small>
            </div>
          ))}
          <p>EVIDENCE</p>
          <div className="demo-evidence"><FileText /><span>Picture_Lock.aaf</span></div>
          <div className="demo-evidence"><FileText /><span>Turnover.ale</span></div>
        </aside>

        <div className="demo-canvas">
          <div className="demo-viewer">
            <div className="demo-frame">
              <div className="demo-frame-grid" />
              <AnimatePresence mode="wait">
                <motion.div
                  key={scene}
                  className="demo-scene"
                  initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -10, scale: 0.99 }}
                  transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
                >
                  <motion.div
                    className="demo-orbit"
                    animate={reduceMotion ? undefined : { rotate: [0, 5, 0] }}
                    transition={{ duration: 3.2, ease: "easeInOut" }}
                  >
                    <Sparkles />
                  </motion.div>
                  <p>{current.eyebrow}</p>
                  <h3>{current.title}</h3>
                  <span>{current.detail}</span>
                </motion.div>
              </AnimatePresence>
              <div className="demo-safe-area" />
              <div className="demo-timecode">01:04:18:12</div>
            </div>
            <div className="demo-transport">
              <button type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause demo" : "Play demo"}>
                {playing ? <Pause /> : <Play />}
              </button>
              <div className="demo-progress">
                <motion.span
                  key={`${scene}-${run}-${playing}`}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: playing && !reduceMotion ? 1 : 0 }}
                  transition={{ duration: sceneDuration / 1000, ease: "linear" }}
                />
              </div>
              <span>00:0{scene * 3 + 1} / 00:10</span>
              <button type="button" onClick={replay} aria-label="Replay demo"><RotateCcw /></button>
            </div>
          </div>

          <div className="demo-analysis">
            <div className="demo-analysis-head">
              <span><Sparkles /> AI project audit</span>
              <small>Read-only</small>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={scene}
                className="demo-result"
                initial={reduceMotion ? false : { opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: -8 }}
                transition={{ duration: 0.38 }}
              >
                <p>{current.status}</p>
                {scene === 0 && <>
                  <div><Check /> 6 bins discovered</div>
                  <div><Check /> Allowed root verified</div>
                  <div><CircleAlert /> 1 active bin lock</div>
                </>}
                {scene === 1 && <>
                  <div><Check /> Clip metadata indexed</div>
                  <div><Check /> Sequence tracks mapped</div>
                  <div><Check /> Source files unchanged</div>
                </>}
                {scene === 2 && <>
                  <div><Check /> Interchange files parsed</div>
                  <div><Check /> No offline mutations</div>
                  <div><CircleAlert /> Review 1 lock before turnover</div>
                </>}
              </motion.div>
            </AnimatePresence>
            <div className="demo-scenes" aria-label="Demo scenes">
              {scenes.map((item, index) => (
                <button
                  type="button"
                  key={item.eyebrow}
                  className={scene === index ? "active" : ""}
                  onClick={() => { setScene(index); setRun((value) => value + 1) }}
                  aria-label={`Show ${item.eyebrow}`}
                  aria-pressed={scene === index}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
