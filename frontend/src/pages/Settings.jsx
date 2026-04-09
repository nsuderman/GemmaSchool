import { useState, useEffect, useCallback } from 'react'
import { useWSLatest } from '../contexts/WebSocketContext'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const MODEL_INFO = {
  'gemma4:e2b': { size: '3.2 GB', minFreeGb: 3,  desc: 'Fastest inference. Great for 8 GB machines.' },
  'gemma4:e4b': { size: '5.0 GB', minFreeGb: 5,  desc: 'Best balance of speed, vision, and quality.' },
  'gemma4:26b': { size: '16.9 GB', minFreeGb: 18, desc: 'Maximum quality. Requires high-memory hardware.' },
}

function fmtBytes(bytes) {
  if (!bytes) return null
  return bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : `${(bytes / 1e6).toFixed(0)} MB`
}

// ── Active model hero card ─────────────────────────────────────
function ActiveModelCard({ model, switching }) {
  if (!model && !switching) {
    return (
      <div className="bg-surface-container-low rounded-2xl p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-outline text-2xl">memory</span>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">Active Model</p>
          <p className="text-sm text-on-surface-variant">No model active — download one below.</p>
        </div>
      </div>
    )
  }

  if (switching) {
    return (
      <div className="bg-primary-container/20 border border-primary/20 rounded-2xl p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Switching Model</p>
          <p className="text-sm text-on-surface font-semibold">llama-server is restarting…</p>
          <p className="text-xs text-on-surface-variant mt-0.5">This takes 30–90 seconds. The indicator will turn green when ready.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-secondary-container/20 border border-secondary/20 rounded-2xl p-6 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-secondary text-2xl">memory</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Running</p>
          <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
        </div>
        <p className="text-base font-headline font-bold text-on-surface">{model.label}</p>
        <p className="text-xs text-on-surface-variant font-mono mt-0.5 truncate">{model.file}</p>
      </div>
      {fmtBytes(model.size_bytes) && (
        <p className="text-xs font-semibold text-on-surface-variant flex-shrink-0">{fmtBytes(model.size_bytes)}</p>
      )}
    </div>
  )
}

// ── Downloaded model row ───────────────────────────────────────
function DownloadedModelRow({ model, busy, message, onSwitch }) {
  return (
    <div className="flex items-center gap-4 p-4 bg-surface-container-low rounded-xl">
      <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-on-surface">{model.label}</p>
        <p className="text-xs text-on-surface-variant font-mono truncate">{model.file}</p>
        {message && <p className="text-[10px] text-secondary mt-0.5">{message}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {fmtBytes(model.size_bytes) && (
          <span className="text-xs text-on-surface-variant">{fmtBytes(model.size_bytes)}</span>
        )}
        <button
          onClick={onSwitch}
          disabled={busy}
          className="px-3 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-lg disabled:opacity-40 flex items-center gap-1.5"
        >
          {busy ? (
            <span className="w-3 h-3 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
          )}
          Use This Model
        </button>
      </div>
    </div>
  )
}

// ── Available model card ───────────────────────────────────────
function AvailableModelCard({ model, sysinfo, busy, downloadPct, error, onDownload }) {
  const info = MODEL_INFO[model.id] || {}
  const fits = sysinfo ? sysinfo.available_gb >= (info.minFreeGb ?? 0) : true
  const isRec = sysinfo?.recommended === model.id
  const isDownloading = busy && downloadPct != null

  return (
    <div className={`p-5 rounded-2xl border transition-all ${
      isRec ? 'border-secondary/40 bg-secondary-container/10' : 'border-outline-variant/20 bg-surface-container-low'
    }`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className="font-headline font-bold text-on-surface">{model.label}</h4>
            {isRec && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary text-on-secondary">
                Recommended
              </span>
            )}
          </div>
          <p className="text-xs text-on-surface-variant">{info.desc || ''}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-on-surface">{info.size || ''}</p>
          <p className={`text-[10px] font-semibold mt-0.5 ${fits ? 'text-secondary' : 'text-error'}`}>
            {info.minFreeGb ? `${info.minFreeGb} GB free RAM ${fits ? '✓' : '— low'}` : ''}
          </p>
        </div>
      </div>

      {/* Download progress */}
      {isDownloading && (
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-on-surface-variant mb-1">
            <span>Downloading from HuggingFace…</span>
            <span className="font-bold text-primary">{downloadPct}%</span>
          </div>
          <div className="h-2 bg-surface-container rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${downloadPct}%` }}
            />
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-error mb-2">{error}</p>}

      <button
        onClick={onDownload}
        disabled={busy}
        className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
          busy
            ? 'bg-surface-container text-on-surface-variant cursor-not-allowed'
            : 'bg-primary text-on-primary hover:opacity-90'
        }`}
      >
        {isDownloading ? (
          <>
            <span className="w-4 h-4 border-2 border-on-surface-variant border-t-transparent rounded-full animate-spin" />
            {downloadPct}% — Downloading
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-[18px]">download</span>
            Download {model.label}
          </>
        )}
      </button>
    </div>
  )
}

// ── Main Settings page ─────────────────────────────────────────
export default function Settings() {
  const [sysinfo, setSysinfo]       = useState(null)
  const [modelData, setModelData]   = useState(null)
  const [switching, setSwitching]   = useState(false)
  const [switchMsg, setSwitchMsg]   = useState('')

  // Per-model state
  const [switchBusy, setSwitchBusy]     = useState({})  // model.id -> bool
  const [switchMsg2, setSwitchMsg2]     = useState({})  // model.id -> msg
  const [dlBusy, setDlBusy]             = useState({})  // model.id -> bool
  const [dlPcts, setDlPcts]             = useState({})  // model.id -> pct
  const [dlErrors, setDlErrors]         = useState({})  // model.id -> error string

  // WS context — watch system events
  const sysEvent = useWSLatest('system.')
  useEffect(() => {
    if (!sysEvent) return
    if (sysEvent.event === 'system.restarting') setSwitching(true)
    if (sysEvent.event === 'system.online') {
      setSwitching(false)
      setSwitchMsg('Model switched successfully.')
      refreshModels()
    }
    if (sysEvent.event === 'system.restart_failed') {
      setSwitching(false)
      setSwitchMsg(`Auto-restart failed. Run: ${sysEvent.data?.command || 'docker restart gemmaschool-llama'}`)
    }
  }, [sysEvent])

  const refreshModels = useCallback(async () => {
    const data = await fetch(`${API}/setup/models`).then((r) => r.json())
    setModelData(data)
  }, [])

  useEffect(() => {
    Promise.all([
      fetch(`${API}/setup/sysinfo`).then((r) => r.json()).catch(() => null),
      fetch(`${API}/setup/models`).then((r) => r.json()).catch(() => null),
    ]).then(([sys, models]) => {
      if (sys) setSysinfo(sys)
      if (models) setModelData(models)
    })
  }, [])

  const allModels   = [...(modelData?.models || []), ...(modelData?.extra_models || [])]
  const activeModel = allModels.find((m) => m.active) || null
  const downloaded  = allModels.filter((m) => m.downloaded && !m.active)
  const available   = allModels.filter((m) => !m.downloaded)

  // Switch model: activate then restart
  const switchModel = async (model) => {
    const id = model.id
    setSwitchBusy((p) => ({ ...p, [id]: true }))
    setSwitchMsg2((p) => ({ ...p, [id]: '' }))

    try {
      const modelName = model.url ? model.id : model.file
      const res = await fetch(`${API}/setup/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: modelName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Activate failed')

      // Trigger restart — WS will broadcast system.restarting
      await fetch(`${API}/setup/restart`, { method: 'POST' })
    } catch (err) {
      setSwitchMsg2((p) => ({ ...p, [id]: String(err) }))
    } finally {
      setSwitchBusy((p) => ({ ...p, [id]: false }))
    }
  }

  // Download model
  const downloadModel = async (model) => {
    const id = model.id
    setDlBusy((p) => ({ ...p, [id]: true }))
    setDlErrors((p) => ({ ...p, [id]: '' }))
    setDlPcts((p) => ({ ...p, [id]: 0 }))

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
          setDlPcts((p) => ({ ...p, [id]: data?.file?.pct ?? p[id] }))
          if (data.status === 'complete') {
            es.close()
            setDlBusy((p) => ({ ...p, [id]: false }))
            setDlPcts((p) => ({ ...p, [id]: null }))
            refreshModels()
          } else if (data.status === 'error') {
            es.close()
            setDlBusy((p) => ({ ...p, [id]: false }))
            setDlErrors((p) => ({ ...p, [id]: data.error || 'Download failed' }))
            setDlPcts((p) => ({ ...p, [id]: null }))
          }
        } catch {}
      }
      es.onerror = () => {
        es.close()
        setDlBusy((p) => ({ ...p, [id]: false }))
        setDlErrors((p) => ({ ...p, [id]: 'Download stream interrupted' }))
      }
    } catch (err) {
      setDlBusy((p) => ({ ...p, [id]: false }))
      setDlErrors((p) => ({ ...p, [id]: String(err) }))
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10 pt-4">
      {/* Header */}
      <header>
        <h2 className="text-4xl font-headline font-extrabold tracking-tight text-on-surface mb-2">
          Model Manager
        </h2>
        <p className="text-on-surface-variant leading-relaxed">
          Download Gemma GGUF models and switch the active inference engine.
          Changes take effect after llama-server restarts.
        </p>
      </header>

      {/* System info mini-bar */}
      {sysinfo && (
        <div className="flex flex-wrap gap-3">
          {[
            { icon: 'memory',               label: 'Total RAM',  val: `${sysinfo.ram_gb} GB` },
            { icon: 'battery_charging_full', label: 'Free RAM',   val: `${sysinfo.available_gb} GB`, warn: sysinfo.available_gb < 4 },
            { icon: 'developer_board',       label: 'CPU Cores',  val: sysinfo.cpu_cores },
          ].map((s) => (
            <div key={s.label} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs ${s.warn ? 'bg-error/10 text-error' : 'bg-surface-container-low text-on-surface-variant'}`}>
              <span className={`material-symbols-outlined text-[16px] ${s.warn ? 'text-error' : 'text-primary'}`}>{s.icon}</span>
              <span className="font-bold">{s.val}</span>
              <span className="opacity-70">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Active model */}
      <section className="space-y-3">
        <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Active Model</p>
        <ActiveModelCard model={activeModel} switching={switching} />
        {switchMsg && (
          <p className={`text-xs px-1 ${switchMsg.includes('failed') || switchMsg.includes('docker') ? 'text-error font-mono' : 'text-secondary font-semibold'}`}>
            {switchMsg}
          </p>
        )}
      </section>

      {/* Downloaded models — switch between them */}
      {downloaded.length > 0 && (
        <section className="space-y-3">
          <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
            Downloaded — {downloaded.length} model{downloaded.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-2">
            {downloaded.map((model) => (
              <DownloadedModelRow
                key={model.id}
                model={model}
                busy={!!switchBusy[model.id] || switching}
                message={switchMsg2[model.id] || ''}
                onSwitch={() => switchModel(model)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Available to download */}
      {available.length > 0 && (
        <section className="space-y-3">
          <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
            Available to Download
          </p>
          <div className="space-y-4">
            {available.map((model) => (
              <AvailableModelCard
                key={model.id}
                model={model}
                sysinfo={sysinfo}
                busy={!!dlBusy[model.id]}
                downloadPct={dlPcts[model.id] ?? null}
                error={dlErrors[model.id] || ''}
                onDownload={() => downloadModel(model)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Runtime config footer */}
      <section className="border-t border-outline-variant/10 pt-6 space-y-3">
        <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Runtime Config</p>
        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
          {[
            ['Model file',     modelData?.active_file || '(none)'],
            ['Server URL',     'http://llama-server:8080'],
            ['Context window', '8192 tokens'],
            ['GPU layers',     '0 (CPU only)'],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface-container-low rounded-xl px-4 py-3">
              <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">{k}</p>
              <p className="text-on-surface text-xs truncate">{v}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-on-surface-variant leading-relaxed">
          Place custom <code className="bg-surface-container px-1 py-0.5 rounded">.gguf</code> files
          in the <code className="bg-surface-container px-1 py-0.5 rounded">./models</code> directory
          and they will appear in Downloaded Models above.
        </p>
      </section>
    </div>
  )
}
