import { useState, useEffect, useRef } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Model presets ─────────────────────────────────────────────
const MODELS = [
  {
    id: 'gemma4:4b',
    name: 'Gemma 4 E4B',
    size: '3.3 GB',
    ram: '6 GB RAM',
    badge: 'Recommended',
    badgeColor: 'bg-secondary-container text-on-secondary-container',
    desc: 'The default competition model. Best balance of speed, vision, and quality on CPU-only hardware.',
  },
  {
    id: 'gemma4:2b',
    name: 'Gemma 4 E2B',
    size: '1.6 GB',
    ram: '4 GB RAM',
    badge: 'Lightweight',
    badgeColor: 'bg-tertiary-container text-on-tertiary-container',
    desc: 'Great for low-memory devices. Faster inference, slightly reduced reasoning.',
  },
  {
    id: 'gemma4:12b',
    name: 'Gemma 4 12B',
    size: '8.1 GB',
    ram: '16 GB RAM',
    badge: 'Advanced',
    badgeColor: 'bg-primary-container text-on-primary-container',
    desc: 'Significantly stronger reasoning. Requires a high-memory machine.',
  },
]

// ── Step components ───────────────────────────────────────────

function StepIndicator({ current, total }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-500 ${
            i < current
              ? 'w-8 bg-primary'
              : i === current
              ? 'w-8 bg-primary/50'
              : 'w-4 bg-surface-container-high'
          }`}
        />
      ))}
    </div>
  )
}

function ProgressBar({ pct, label, downloaded, total, status }) {
  const formatBytes = (bytes) => {
    if (!bytes) return '—'
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
    return `${(bytes / 1e6).toFixed(0)} MB`
  }

  const color =
    status === 'done'
      ? 'bg-secondary'
      : status === 'error'
      ? 'bg-error'
      : 'bg-primary'

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-xs">
        <span className="font-semibold text-on-surface truncate max-w-[60%]">{label}</span>
        <span className="text-on-surface-variant font-mono">
          {status === 'done'
            ? '✓ Complete'
            : status === 'error'
            ? '✗ Error'
            : status === 'pending'
            ? 'Waiting…'
            : `${formatBytes(downloaded)} / ${formatBytes(total)}`}
        </span>
      </div>
      <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color} ${
            status === 'downloading' && pct < 5 ? 'animate-pulse' : ''
          }`}
          style={{ width: `${Math.max(pct || 0, status === 'pending' ? 0 : 2)}%` }}
        />
      </div>
      {status === 'downloading' && total > 0 && (
        <p className="text-[10px] text-on-surface-variant text-right">
          {pct}%
        </p>
      )}
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────────

export default function SetupWizard({ onComplete }) {
  const TOTAL_STEPS = 4
  const [step, setStep] = useState(0)

  // Form state
  const [selectedModel, setSelected] = useState(MODELS[0])

  // System info
  const [sysinfo, setSysinfo]       = useState(null)
  const [ramOverride, setRamOverride] = useState(null)   // user can correct detection

  // Download state
  const [sessionId, setSessionId]   = useState(null)
  const [dlState, setDlState]       = useState(null)
  const [startError, setStartError] = useState(null)
  const sseRef = useRef(null)

  // ── Fetch system info from backend ───────────────────────────
  // The launcher scripts (Start GemmaSchool.command / .bat) detect real
  // host RAM via sysctl/wmic before Docker starts and inject it as
  // HOST_RAM_GB — so the backend always returns the true hardware value.
  useEffect(() => {
    if (step !== 1 || sysinfo) return
    fetch(`${API}/setup/sysinfo`)
      .then((r) => r.json())
      .then((data) => {
        setSysinfo(data)
        const rec = MODELS.find((m) => m.id === data.recommended)
        if (rec) setSelected(rec)
      })
      .catch(() => {/* backend not reachable yet — user can use dropdown */})
  }, [step])

  // ── SSE listener ─────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return

    const es = new EventSource(`${API}/setup/progress/${sessionId}`)
    sseRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        setDlState(data)
        if (data.status === 'complete') {
          es.close()
          setTimeout(() => setStep(3), 800)
        }
        if (data.status === 'error') {
          es.close()
        }
      } catch {
        // ignore malformed
      }
    }

    es.onerror = () => es.close()

    return () => es.close()
  }, [sessionId])

  // ── Handlers ──────────────────────────────────────────────────
  const startDownload = async () => {
    setStartError(null)
    setStep(2)

    try {
      const res = await fetch(`${API}/setup/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: selectedModel.id }),
      })

      if (!res.ok) {
        const err = await res.json()
        setStartError(err.detail || 'Failed to start download.')
        setStep(1)
        return
      }

      const { session_id } = await res.json()
      setSessionId(session_id)
    } catch (e) {
      setStartError(String(e))
      setStep(1)
    }
  }

  // ── Render steps ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Card */}
      <div className="w-full max-w-2xl bg-surface-container-lowest rounded-xl editorial-shadow overflow-hidden">

        {/* Header shimmer bar */}
        <div className="h-1.5 ai-shimmer w-full" />

        <div className="p-10">
          {/* Logo + step indicator */}
          <div className="flex items-center justify-between mb-10">
            <div>
              <h1 className="text-2xl font-headline font-bold bg-gradient-to-br from-primary to-primary-fixed-dim bg-clip-text text-transparent">
                GemmaSchool
              </h1>
              <p className="text-[10px] uppercase tracking-widest text-outline mt-0.5">
                First-Run Setup
              </p>
            </div>
            <StepIndicator current={step} total={TOTAL_STEPS} />
          </div>

          {/* ── Step 0: Welcome ───────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface mb-3">
                  Welcome to your sovereign school.
                </h2>
                <p className="text-on-surface-variant leading-relaxed">
                  No models were found. This wizard will pull the AI model needed to power
                  your Quest system via <strong className="text-on-surface">Ollama</strong> —
                  everything runs locally on your hardware, with no accounts required.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: 'lock',        title: '100% Local',   desc: 'No data leaves your machine' },
                  { icon: 'bolt',        title: 'Ollama',       desc: 'One-command model serving' },
                  { icon: 'folder_open', title: 'Knowledge Grove', desc: 'Built-in graph view' },
                ].map((f) => (
                  <div key={f.title} className="bg-surface-container-low rounded-xl p-4 text-center">
                    <span className="material-symbols-outlined text-primary text-2xl block mb-2">
                      {f.icon}
                    </span>
                    <p className="text-xs font-bold text-on-surface">{f.title}</p>
                    <p className="text-[10px] text-on-surface-variant mt-0.5">{f.desc}</p>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-secondary-container/10 rounded-xl flex items-start gap-3">
                <span className="material-symbols-outlined text-secondary text-[20px] flex-shrink-0 mt-0.5">
                  info
                </span>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  No Hugging Face account or API token needed. Ollama pulls the model
                  directly from the Ollama registry. Setup takes 5–15 minutes depending
                  on your connection speed.
                </p>
              </div>

              <button
                onClick={() => setStep(1)}
                className="w-full py-4 ai-shimmer text-on-primary rounded-xl font-headline font-bold text-base flex items-center justify-center gap-2 shadow-primary-glow hover:scale-[1.01] active:scale-99 transition-transform"
              >
                Get Started
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </button>
            </div>
          )}

          {/* ── Step 1: Choose model ──────────────────────────── */}
          {step === 1 && (
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface mb-3">
                  Choose your model
                </h2>
                <p className="text-on-surface-variant leading-relaxed">
                  Select a model size based on your available RAM. Larger models give
                  better results but require more memory.
                </p>
              </div>

              {/* Hardware info card */}
              {sysinfo ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { icon: 'memory',          label: 'Total RAM',     value: `${ramOverride ?? sysinfo.ram_gb} GB` },
                      { icon: 'battery_charging_full', label: 'Free RAM', value: `${sysinfo.available_gb} GB`,
                        sub: sysinfo.available_gb < 4 ? 'Low — close apps' : null },
                      { icon: 'developer_board', label: 'CPU Cores',     value: sysinfo.cpu_cores ?? '—' },
                      { icon: 'recommend',       label: 'Best Fit',      value: MODELS.find(m => m.id === sysinfo.recommended)?.name ?? sysinfo.recommended },
                    ].map((s) => (
                      <div key={s.label} className={`bg-surface-container-low rounded-xl p-4 text-center ${s.sub ? 'ring-1 ring-error/40' : ''}`}>
                        <span className={`material-symbols-outlined text-xl block mb-1 ${s.sub ? 'text-error' : 'text-primary'}`}>{s.icon}</span>
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{s.label}</p>
                        <p className={`text-sm font-bold mt-0.5 ${s.sub ? 'text-error' : 'text-on-surface'}`}>{s.value}</p>
                        {s.sub && <p className="text-[9px] text-error mt-0.5">{s.sub}</p>}
                      </div>
                    ))}
                  </div>
                  {/* Manual RAM override — fallback if launcher didn't inject HOST_RAM_GB */}
                  <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
                    <span className="material-symbols-outlined text-[14px] text-outline">info</span>
                    Total RAM looks wrong?
                    <select
                      value={ramOverride ?? ''}
                      onChange={(e) => {
                        const gb = Number(e.target.value) || null
                        setRamOverride(gb)
                        if (gb) {
                          const avail = sysinfo.available_gb
                          const recommended =
                            avail >= 14 ? 'gemma4:12b' :
                            avail >= 5  ? 'gemma4:4b'  : 'gemma4:2b'
                          setSysinfo((s) => ({ ...s, ram_gb: gb, recommended }))
                          const rec = MODELS.find((m) => m.id === recommended)
                          if (rec) setSelected(rec)
                        }
                      }}
                      className="bg-surface-container rounded-lg px-2 py-1 text-[11px] text-on-surface border-none focus:outline-none focus:ring-1 focus:ring-primary/20"
                    >
                      <option value="">Select actual RAM</option>
                      {[4, 8, 16, 32, 64].map((gb) => (
                        <option key={gb} value={gb}>{gb} GB</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {[0,1,2].map(i => (
                    <div key={i} className="h-20 shimmer rounded-xl" />
                  ))}
                </div>
              )}

              {/* Model cards */}
              <div className="space-y-3">
                {MODELS.map((m) => {
                  const ramRequired = parseFloat(m.ram)
                  const effectiveRam = sysinfo?.available_gb  // use free RAM, not total
                  const fits = effectiveRam ? effectiveRam >= ramRequired : true
                  const isRec = sysinfo?.recommended === m.id
                  return (
                  <button
                    key={m.id}
                    onClick={() => setSelected(m)}
                    className={`w-full text-left p-5 rounded-xl border-2 transition-all ${
                      selectedModel.id === m.id
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent bg-surface-container-low hover:bg-surface-container'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-headline font-bold text-on-surface text-sm">
                            {m.name}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.badgeColor}`}>
                            {m.badge}
                          </span>
                          {isRec && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary text-on-secondary">
                              Your System
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-on-surface-variant">{m.desc}</p>
                      </div>
                      <div className="text-right flex-shrink-0 space-y-1">
                        <p className="text-sm font-bold text-on-surface">{m.size}</p>
                        <p className={`text-[10px] font-semibold ${fits ? 'text-secondary' : 'text-error'}`}>
                          {fits
                            ? `${m.ram} ✓`
                            : `${m.ram} — needs more`}
                        </p>
                      </div>
                    </div>
                  </button>
                  )
                })}
              </div>

              {startError && (
                <p className="text-sm text-error bg-error-container/20 rounded-xl p-3">
                  {startError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(0)}
                  className="px-6 py-3 ghost-border rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={startDownload}
                  className="flex-1 py-3 ai-shimmer text-on-primary rounded-xl font-bold text-sm hover:scale-[1.01] active:scale-99 transition-transform shadow-primary-glow flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  Pull {selectedModel.name}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Pulling ───────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface mb-3">
                  Pulling model
                </h2>
                <p className="text-on-surface-variant leading-relaxed">
                  Ollama is downloading <strong className="text-on-surface">{selectedModel.name}</strong> ({selectedModel.size}).
                  This may take several minutes depending on your connection.
                </p>
              </div>

              {/* Progress */}
              <div className="space-y-6">
                {dlState?.files
                  ? Object.entries(dlState.files).map(([key, f]) => (
                      <ProgressBar
                        key={key}
                        label={f.label}
                        pct={f.pct}
                        downloaded={f.downloaded}
                        total={f.total}
                        status={f.status}
                      />
                    ))
                  : (
                    <div className="space-y-2">
                      <div className="h-4 shimmer rounded" />
                      <div className="h-2 shimmer rounded" />
                    </div>
                  )}
              </div>

              {/* Status message */}
              <div className="flex items-center gap-3 p-4 bg-surface-container-low rounded-xl">
                {dlState?.status === 'error' ? (
                  <>
                    <span className="material-symbols-outlined text-error">error</span>
                    <p className="text-sm text-error">{dlState.error}</p>
                  </>
                ) : dlState?.status === 'complete' ? (
                  <>
                    <span className="material-symbols-outlined text-secondary material-symbols-filled">check_circle</span>
                    <p className="text-sm font-semibold text-secondary">Model ready. Configuring…</p>
                  </>
                ) : (
                  <>
                    <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <p className="text-sm text-on-surface-variant">
                      {dlState?.status === 'starting' ? 'Connecting to Ollama…' : 'Downloading layers…'}
                    </p>
                  </>
                )}
              </div>

              {dlState?.status === 'error' && (
                <button
                  onClick={() => { setStep(1); setDlState(null); setSessionId(null) }}
                  className="w-full py-3 ghost-border rounded-xl text-sm font-bold text-on-surface hover:bg-surface-container transition-colors"
                >
                  Back to Model Selection
                </button>
              )}
            </div>
          )}

          {/* ── Step 3: Complete ──────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-8 text-center">
              <div className="w-20 h-20 bg-secondary-container rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-secondary text-4xl material-symbols-filled">
                  check_circle
                </span>
              </div>

              <div>
                <h2 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface mb-3">
                  You're all set.
                </h2>
                <p className="text-on-surface-variant leading-relaxed">
                  <strong className="text-on-surface">{selectedModel.name}</strong> is ready and
                  your <code className="font-mono text-primary text-sm">.env</code> has been configured.
                  Your sovereign school is ready to begin.
                </p>
              </div>

              <div className="bg-surface-container-low rounded-xl p-5 text-left space-y-2">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">
                  Model active
                </p>
                <code className="block font-mono text-sm text-primary bg-surface-container rounded-lg px-4 py-3">
                  ollama run {selectedModel.id}
                </code>
                <p className="text-xs text-on-surface-variant">
                  Ollama is running inside Docker and managed automatically by GemmaSchool.
                </p>
              </div>

              <button
                onClick={onComplete}
                className="w-full py-4 ai-shimmer text-on-primary rounded-xl font-headline font-bold text-base flex items-center justify-center gap-2 shadow-primary-glow hover:scale-[1.01] active:scale-99 transition-transform"
              >
                <span className="material-symbols-outlined text-[20px]">school</span>
                Enter GemmaSchool
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
