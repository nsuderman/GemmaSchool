import { useState, useEffect, useRef } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Model presets ─────────────────────────────────────────────
const MODELS = [
  {
    id: 'gemma3-4b-q4',
    name: 'Gemma 3 4B — Q4',
    repo: 'google/gemma-3-4b-it-qat-q4_0-gguf',
    file: 'gemma-3-4b-it-q4_0.gguf',
    size: '3.3 GB',
    ram: '6 GB RAM',
    badge: 'Recommended',
    badgeColor: 'bg-secondary-container text-on-secondary-container',
    desc: 'Best balance of speed and quality on CPU-only hardware.',
  },
  {
    id: 'gemma3-4b-q8',
    name: 'Gemma 3 4B — Q8',
    repo: 'google/gemma-3-4b-it-qat-q4_0-gguf',
    file: 'gemma-3-4b-it-q8_0.gguf',
    size: '4.7 GB',
    ram: '8 GB RAM',
    badge: 'Higher Quality',
    badgeColor: 'bg-primary-container text-on-primary-container',
    desc: 'Better reasoning accuracy. Requires more RAM.',
  },
  {
    id: 'custom',
    name: 'Custom GGUF',
    repo: '',
    file: '',
    size: '—',
    ram: 'Varies',
    badge: 'Advanced',
    badgeColor: 'bg-surface-container-high text-on-surface-variant',
    desc: 'Specify your own Hugging Face repo and filename.',
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
  const TOTAL_STEPS = 5
  const [step, setStep] = useState(0)

  // Form state
  const [hfToken, setHfToken]         = useState('')
  const [showToken, setShowToken]     = useState(false)
  const [selectedModel, setSelected] = useState(MODELS[0])
  const [customRepo, setCustomRepo]   = useState('')
  const [customFile, setCustomFile]   = useState('')
  const [gpuLayers, setGpuLayers]     = useState(0)
  const [threads, setThreads]         = useState(4)
  const [ctxSize, setCtxSize]         = useState(4096)

  // Download state
  const [sessionId, setSessionId]     = useState(null)
  const [dlState, setDlState]         = useState(null)
  const [startError, setStartError]   = useState(null)
  const sseRef = useRef(null)

  const model = selectedModel.id === 'custom'
    ? { ...selectedModel, repo: customRepo, file: customFile }
    : selectedModel

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
          setTimeout(() => setStep(4), 800)
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
    setStep(3)

    try {
      const res = await fetch(`${API}/setup/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hf_token:    hfToken,
          logic_repo:  model.repo,
          logic_file:  model.file,
          vision_repo: model.repo,
          vision_file: model.file,
          gpu_layers:  gpuLayers,
          threads,
          ctx_size:    ctxSize,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setStartError(err.detail || 'Failed to start download.')
        setStep(2)
        return
      }

      const { session_id } = await res.json()
      setSessionId(session_id)
    } catch (e) {
      setStartError(String(e))
      setStep(2)
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
                  No models were found in <code className="font-mono text-primary text-sm">/models</code>.
                  This wizard will guide you through downloading the AI models needed to power
                  your Quest system — everything runs locally on your hardware.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: 'lock', title: '100% Local', desc: 'No data leaves your machine' },
                  { icon: 'bolt', title: 'llama.cpp', desc: 'Optimised CPU inference' },
                  { icon: 'folder_open', title: 'Obsidian Vault', desc: 'Your data, your format' },
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

              <div className="p-4 bg-tertiary-container/10 rounded-xl flex items-start gap-3">
                <span className="material-symbols-outlined text-tertiary text-[20px] flex-shrink-0 mt-0.5">
                  info
                </span>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  You'll need a free <strong className="text-on-surface">Hugging Face</strong> account
                  and must accept the Gemma model license before downloading.
                  Setup takes 5–10 minutes depending on your connection.
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

          {/* ── Step 1: HF Token ──────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface mb-3">
                  Hugging Face token
                </h2>
                <p className="text-on-surface-variant leading-relaxed">
                  Gemma models require authentication. Paste your access token below — it is only
                  stored in your local <code className="font-mono text-primary text-sm">.env</code> file.
                </p>
              </div>

              <div className="space-y-3">
                <ol className="text-sm text-on-surface-variant space-y-1.5 list-none">
                  {[
                    'Create a free account at huggingface.co',
                    'Visit the Gemma model page and click "Accept License"',
                    'Go to Settings → Access Tokens → New Token (read scope)',
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary-container text-on-primary-container text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>

                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={hfToken}
                    onChange={(e) => setHfToken(e.target.value)}
                    placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full bg-surface-container-high rounded-xl px-4 py-3.5 pr-12 text-sm font-mono text-on-surface placeholder:text-on-surface-variant border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {showToken ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(0)}
                  className="px-6 py-3 ghost-border rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={hfToken.length < 10}
                  className="flex-1 py-3 ai-shimmer text-on-primary rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-99 transition-transform shadow-primary-glow"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Model + Hardware ──────────────────────── */}
          {step === 2 && (
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface mb-3">
                  Choose your model
                </h2>
                <p className="text-on-surface-variant leading-relaxed">
                  Select a quantisation level based on your available RAM.
                </p>
              </div>

              {/* Model cards */}
              <div className="space-y-3">
                {MODELS.map((m) => (
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
                        </div>
                        <p className="text-xs text-on-surface-variant">{m.desc}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-on-surface">{m.size}</p>
                        <p className="text-[10px] text-on-surface-variant">{m.ram}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Custom inputs */}
              {selectedModel.id === 'custom' && (
                <div className="space-y-3 p-4 bg-surface-container-low rounded-xl">
                  <input
                    type="text"
                    value={customRepo}
                    onChange={(e) => setCustomRepo(e.target.value)}
                    placeholder="HF repo (e.g. bartowski/gemma-3-4b-it-GGUF)"
                    className="w-full bg-surface-container-high rounded-lg px-4 py-3 text-sm font-mono text-on-surface placeholder:text-on-surface-variant border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    type="text"
                    value={customFile}
                    onChange={(e) => setCustomFile(e.target.value)}
                    placeholder="Filename (e.g. gemma-3-4b-it-Q5_K_M.gguf)"
                    className="w-full bg-surface-container-high rounded-lg px-4 py-3 text-sm font-mono text-on-surface placeholder:text-on-surface-variant border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}

              {/* Hardware config */}
              <div className="space-y-4">
                <h3 className="text-sm font-headline font-bold text-on-surface">
                  Hardware Configuration
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'CPU Threads', value: threads, min: 1, max: 32, set: setThreads },
                    { label: 'GPU Layers',  value: gpuLayers, min: 0, max: 100, set: setGpuLayers, hint: '0 = CPU only' },
                    { label: 'Context',     value: ctxSize, min: 512, max: 32768, step: 512, set: setCtxSize },
                  ].map((field) => (
                    <div key={field.label} className="bg-surface-container-low rounded-xl p-4">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-2">
                        {field.label}
                        {field.hint && (
                          <span className="ml-1 normal-case text-outline">({field.hint})</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step || 1}
                        value={field.value}
                        onChange={(e) => field.set(Number(e.target.value))}
                        className="w-full bg-surface-container-high rounded-lg px-3 py-2 text-sm font-mono text-on-surface border-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {startError && (
                <p className="text-sm text-error bg-error-container/20 rounded-xl p-3">
                  {startError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-3 ghost-border rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={startDownload}
                  disabled={
                    selectedModel.id === 'custom' && (!customRepo || !customFile)
                  }
                  className="flex-1 py-3 ai-shimmer text-on-primary rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-99 transition-transform shadow-primary-glow flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  Download &amp; Configure
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Downloading ───────────────────────────── */}
          {step === 3 && (
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-headline font-extrabold tracking-tight text-on-surface mb-3">
                  Downloading models
                </h2>
                <p className="text-on-surface-variant leading-relaxed">
                  Fetching from Hugging Face into your local <code className="font-mono text-primary text-sm">/models</code> directory.
                  This may take several minutes depending on your connection.
                </p>
              </div>

              {/* Progress bars */}
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
                    <p className="text-sm font-semibold text-secondary">All models downloaded. Configuring…</p>
                  </>
                ) : (
                  <>
                    <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <p className="text-sm text-on-surface-variant">
                      {dlState?.status === 'starting' ? 'Connecting to Hugging Face…' : 'Downloading…'}
                    </p>
                  </>
                )}
              </div>

              {dlState?.status === 'error' && (
                <button
                  onClick={() => { setStep(2); setDlState(null); setSessionId(null) }}
                  className="w-full py-3 ghost-border rounded-xl text-sm font-bold text-on-surface hover:bg-surface-container transition-colors"
                >
                  Back to Configuration
                </button>
              )}
            </div>
          )}

          {/* ── Step 4: Complete ──────────────────────────────── */}
          {step === 4 && (
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
                  Models are downloaded and your <code className="font-mono text-primary text-sm">.env</code> has
                  been configured. Start the full stack to begin your learning journey.
                </p>
              </div>

              <div className="bg-surface-container-low rounded-xl p-5 text-left space-y-2">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">
                  Next: start the full stack
                </p>
                <code className="block font-mono text-sm text-primary bg-surface-container rounded-lg px-4 py-3">
                  docker-compose --profile full up
                </code>
                <p className="text-xs text-on-surface-variant">
                  This starts llama-server, the backend, and FastSD together.
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
