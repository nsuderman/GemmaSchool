import { useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const MODEL_DESCRIPTIONS = {
  'gemma4:e2b': 'Fast inference with a smaller footprint. Best for 8 GB machines.',
  'gemma4:e4b': 'Best balance of speed, vision, and quality on CPU-only hardware.',
  'gemma4:26b': 'Maximum quality and reasoning. Requires a high-memory machine.',
}

function formatBytes(bytes) {
  if (!bytes) return '—'
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`
}

function SysInfoCard({ sysinfo }) {
  if (!sysinfo) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 shimmer rounded-xl" />
        ))}
      </div>
    )
  }

  const MODELS_RECOMMENDED = {
    'gemma4:e2b': 'Gemma 4 E2B',
    'gemma4:e4b': 'Gemma 4 E4B',
    'gemma4:26b': 'Gemma 4 26B',
  }

  const stats = [
    { icon: 'memory',               label: 'Total RAM',  value: `${sysinfo.ram_gb} GB` },
    {
      icon: 'battery_charging_full',
      label: 'Free RAM',
      value: `${sysinfo.available_gb} GB`,
      warn: sysinfo.available_gb < 4,
      sub: sysinfo.available_gb < 4 ? 'Low — close other apps' : null,
    },
    { icon: 'developer_board',      label: 'CPU Cores',  value: sysinfo.cpu_cores ?? '—' },
    { icon: 'recommend',            label: 'Best Fit',   value: MODELS_RECOMMENDED[sysinfo.recommended] ?? sysinfo.recommended },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`bg-surface-container-low rounded-xl p-4 text-center ${s.warn ? 'ring-1 ring-error/40' : ''}`}
        >
          <span className={`material-symbols-outlined text-xl block mb-1 ${s.warn ? 'text-error' : 'text-primary'}`}>
            {s.icon}
          </span>
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{s.label}</p>
          <p className={`text-sm font-bold mt-0.5 ${s.warn ? 'text-error' : 'text-on-surface'}`}>{s.value}</p>
          {s.sub && <p className="text-[9px] text-error mt-0.5">{s.sub}</p>}
        </div>
      ))}
    </div>
  )
}

function ModelCard({ model, busy, error, message, downloadPct, onDownload, onActivate }) {
  const isDownloading = busy && downloadPct != null
  const isActivating = busy && downloadPct == null

  return (
    <div
      className={`p-5 rounded-xl border transition-all ${
        model.active
          ? 'bg-secondary-container/20 border-secondary/30'
          : 'bg-surface-container-low border-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className="font-headline font-bold text-on-surface text-sm">{model.label}</h4>
            {model.active && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary text-on-secondary">
                Active
              </span>
            )}
            {model.downloaded && !model.active && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-container-high text-on-surface-variant">
                Downloaded
              </span>
            )}
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {MODEL_DESCRIPTIONS[model.id] || model.label}
          </p>
          {model.downloaded && (
            <p className="text-[10px] text-on-surface-variant mt-1">
              On disk: {formatBytes(model.size_bytes)}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs font-mono text-on-surface-variant">{model.file}</p>
        </div>
      </div>

      {/* Progress bar */}
      {isDownloading && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-on-surface-variant mb-1">
            <span>Downloading…</span>
            <span className="font-bold text-primary">{downloadPct}%</span>
          </div>
          <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${downloadPct}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-error mt-2">{error}</p>
      )}
      {message && !error && (
        <p className="text-[11px] text-on-surface-variant mt-2">{message}</p>
      )}

      <div className="flex gap-2 mt-3">
        {!model.downloaded && model.url && (
          <button
            onClick={onDownload}
            disabled={busy}
            className="px-3 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-lg disabled:opacity-40 flex items-center gap-1.5"
          >
            {isDownloading ? (
              <>
                <span className="w-3 h-3 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
                {downloadPct}%
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[14px]">download</span>
                Download
              </>
            )}
          </button>
        )}

        {model.downloaded && !model.active && (
          <button
            onClick={onActivate}
            disabled={busy}
            className="px-3 py-1.5 bg-secondary text-on-secondary text-xs font-bold rounded-lg disabled:opacity-40 flex items-center gap-1.5"
          >
            {isActivating ? (
              <span className="w-3 h-3 border-2 border-on-secondary border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
            )}
            Activate
          </button>
        )}

        {model.active && (
          <div className="flex items-center gap-1.5 text-[11px] text-secondary font-semibold">
            <span className="material-symbols-outlined text-[14px]">check_circle</span>
            Currently active
          </div>
        )}
      </div>
    </div>
  )
}

export default function Settings() {
  const [sysinfo, setSysinfo] = useState(null)
  const [modelData, setModelData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Per-model state keyed by model.id
  const [busy, setBusy] = useState({})
  const [errors, setErrors] = useState({})
  const [messages, setMessages] = useState({})
  const [downloadPcts, setDownloadPcts] = useState({})

  const refreshModels = useCallback(async () => {
    const data = await fetch(`${API}/setup/models`).then((r) => r.json())
    setModelData(data)
  }, [])

  useEffect(() => {
    Promise.all([
      fetch(`${API}/setup/sysinfo`).then((r) => r.json()),
      fetch(`${API}/setup/models`).then((r) => r.json()),
    ])
      .then(([sys, models]) => {
        setSysinfo(sys)
        setModelData(models)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const downloadModel = async (model) => {
    const id = model.id
    setBusy((p) => ({ ...p, [id]: true }))
    setErrors((p) => ({ ...p, [id]: '' }))
    setMessages((p) => ({ ...p, [id]: 'Starting download…' }))
    setDownloadPcts((p) => ({ ...p, [id]: 0 }))

    try {
      const res = await fetch(`${API}/setup/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: id }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to start download')
      }
      const { session_id } = await res.json()
      const es = new EventSource(`${API}/setup/progress/${session_id}`)

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setDownloadPcts((p) => ({ ...p, [id]: data?.file?.pct ?? p[id] }))

          if (data.status === 'complete') {
            es.close()
            setBusy((p) => ({ ...p, [id]: false }))
            setMessages((p) => ({ ...p, [id]: 'Download complete.' }))
            setDownloadPcts((p) => ({ ...p, [id]: null }))
            refreshModels()
          } else if (data.status === 'error') {
            es.close()
            setBusy((p) => ({ ...p, [id]: false }))
            setErrors((p) => ({ ...p, [id]: data.error || 'Download failed' }))
            setDownloadPcts((p) => ({ ...p, [id]: null }))
          }
        } catch {
          // ignore malformed SSE
        }
      }

      es.onerror = () => {
        es.close()
        setBusy((p) => ({ ...p, [id]: false }))
        setErrors((p) => ({ ...p, [id]: 'Download stream interrupted' }))
      }
    } catch (err) {
      setBusy((p) => ({ ...p, [id]: false }))
      setErrors((p) => ({ ...p, [id]: String(err) }))
    }
  }

  const activateModel = async (model) => {
    const id = model.id
    setBusy((p) => ({ ...p, [id]: true }))
    setErrors((p) => ({ ...p, [id]: '' }))
    setMessages((p) => ({ ...p, [id]: 'Activating…' }))
    setDownloadPcts((p) => ({ ...p, [id]: null }))

    try {
      const modelName = model.url ? model.id : model.file
      const res = await fetch(`${API}/setup/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: modelName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to activate')
      setMessages((p) => ({ ...p, [id]: 'Activated. Restart GemmaSchool to apply.' }))
      refreshModels()
    } catch (err) {
      setErrors((p) => ({ ...p, [id]: String(err) }))
    } finally {
      setBusy((p) => ({ ...p, [id]: false }))
    }
  }

  const allModels = [...(modelData?.models || []), ...(modelData?.extra_models || [])]
  const anyBusy = Object.values(busy).some(Boolean)

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      <header className="pt-4">
        <h2 className="text-4xl font-headline font-extrabold tracking-tight text-on-surface mb-2">
          Settings
        </h2>
        <p className="text-on-surface-variant leading-relaxed">
          Manage local models, view system requirements, and configure the inference runtime.
        </p>
      </header>

      {/* System Info */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">computer</span>
          <h3 className="font-headline font-bold text-on-surface">System Info</h3>
        </div>
        <SysInfoCard sysinfo={sysinfo} />
        {sysinfo && (
          <p className="text-[11px] text-on-surface-variant">
            Free RAM is measured live and used for model recommendations. Close other apps to free up memory before downloading a large model.
          </p>
        )}
      </section>

      {/* Model Manager */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">psychology</span>
            <h3 className="font-headline font-bold text-on-surface">Model Manager</h3>
          </div>
          <button
            onClick={refreshModels}
            disabled={loading || anyBusy}
            className="text-xs text-primary font-bold hover:underline disabled:opacity-40 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-24 shimmer rounded-xl" />)}
          </div>
        ) : allModels.length === 0 ? (
          <div className="text-center p-8 text-on-surface-variant text-sm">
            No models found in <code className="text-xs bg-surface-container px-1 py-0.5 rounded">./models</code>
          </div>
        ) : (
          <div className="space-y-3">
            {allModels.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                busy={!!busy[model.id]}
                error={errors[model.id] || ''}
                message={messages[model.id] || ''}
                downloadPct={downloadPcts[model.id] ?? null}
                onDownload={() => downloadModel(model)}
                onActivate={() => activateModel(model)}
              />
            ))}
          </div>
        )}

        <div className="flex items-start gap-2 p-3 bg-surface-container-low rounded-lg text-[11px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px] text-outline mt-0.5">info</span>
          <span>
            After activating a different model, restart GemmaSchool so llama.cpp loads the new weights.
            Place custom <code className="bg-surface-container px-1 py-0.5 rounded">.gguf</code> files
            in the <code className="bg-surface-container px-1 py-0.5 rounded">./models</code> directory
            to have them appear here.
          </span>
        </div>
      </section>

      {/* Runtime config */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">settings</span>
          <h3 className="font-headline font-bold text-on-surface">Runtime Config</h3>
        </div>
        <div className="bg-surface-container-low rounded-xl p-5 space-y-3 text-sm font-mono">
          <div className="flex justify-between">
            <span className="text-on-surface-variant text-xs">Active model file</span>
            <span className="text-on-surface text-xs">{modelData?.active_file || '(none)'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant text-xs">llama-server URL</span>
            <span className="text-on-surface text-xs">http://llama-server:8080</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant text-xs">Context window</span>
            <span className="text-on-surface text-xs">8192 tokens</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant text-xs">GPU layers</span>
            <span className="text-on-surface text-xs">0 (CPU only)</span>
          </div>
        </div>
      </section>
    </div>
  )
}
