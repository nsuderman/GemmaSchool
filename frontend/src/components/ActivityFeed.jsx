const EVENT_CONFIG = {
  'model.download.start':    { icon: 'download',        color: 'text-primary',   bg: 'bg-primary/10'   },
  'model.download.progress': { icon: 'downloading',     color: 'text-primary',   bg: 'bg-primary/10'   },
  'model.download.complete': { icon: 'check_circle',    color: 'text-secondary', bg: 'bg-secondary/10' },
  'model.download.error':    { icon: 'error',           color: 'text-error',     bg: 'bg-error/10'     },
  'model.activated':         { icon: 'memory',          color: 'text-secondary', bg: 'bg-secondary/10' },
  'agent.task.start':        { icon: 'play_circle',     color: 'text-tertiary',  bg: 'bg-tertiary/10'  },
  'agent.task.progress':     { icon: 'hourglass_top',   color: 'text-tertiary',  bg: 'bg-tertiary/10'  },
  'agent.task.complete':     { icon: 'task_alt',        color: 'text-secondary', bg: 'bg-secondary/10' },
  'agent.task.error':        { icon: 'cancel',          color: 'text-error',     bg: 'bg-error/10'     },
  'quest.completed':         { icon: 'emoji_events',    color: 'text-secondary', bg: 'bg-secondary/10' },
  'quest_completed':         { icon: 'emoji_events',    color: 'text-secondary', bg: 'bg-secondary/10' },
  'mentor_note':             { icon: 'auto_awesome',    color: 'text-tertiary',  bg: 'bg-tertiary/10'  },
}

const DEFAULT_CONFIG = { icon: 'bolt', color: 'text-outline', bg: 'bg-surface-container' }

function cap(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str
}

function formatMessage(ev) {
  const { event, data = {} } = ev
  switch (event) {
    case 'model.download.start':
      return `Downloading ${data.label || data.model_id}…`
    case 'model.download.progress':
      return `${data.label || data.model_id} — ${data.pct}% (${data.downloaded_mb} / ${data.total_mb} MB)`
    case 'model.download.complete':
      return data.cached
        ? `${data.label || data.model_id} already present, ready to use`
        : `${data.label || data.model_id} downloaded successfully`
    case 'model.download.error':
      return `Download failed: ${data.error}`
    case 'model.activated':
      return `${data.label || data.model_id} set as active model — restart to apply`
    case 'agent.task.start':
      return `${cap(data.label || data.agent)} started: ${data.task || ''}`
    case 'agent.task.progress':
      return `${cap(data.label || data.agent)}: ${data.message || ''}`
    case 'agent.task.complete':
      return data.message || `${cap(data.label || data.agent)} completed`
    case 'agent.task.error':
      return `${cap(data.label || data.agent)} error: ${data.error}`
    case 'quest.completed':
    case 'quest_completed':
      return `Quest completed: ${data.quest || data.name || 'unknown'}`
    case 'mentor_note':
      return data.message || 'New mentor insight'
    default:
      return JSON.stringify(data)
  }
}

function formatEventLabel(event) {
  return event.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export default function ActivityFeed({ events = [], maxHeight = 'max-h-96' }) {
  if (events.length === 0) {
    return (
      <div className="bg-surface-container-lowest rounded-xl p-8 text-center editorial-shadow">
        <span className="material-symbols-outlined text-outline text-4xl block mb-3">
          sensors
        </span>
        <p className="text-on-surface-variant text-sm font-medium">
          Awaiting backend activity…
        </p>
        <p className="text-on-surface-variant text-xs mt-1 opacity-60">
          Downloads, agent tasks, and quest completions will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className={`space-y-2 overflow-y-auto ${maxHeight}`}>
      {events.map((ev, i) => {
        const cfg = EVENT_CONFIG[ev.event] ?? DEFAULT_CONFIG
        const msg = formatMessage(ev)
        const label = formatEventLabel(ev.event)

        return (
          <div
            key={i}
            className="flex items-start gap-3 p-3 bg-surface-container-lowest rounded-xl hover:bg-primary-container/10 transition-colors editorial-shadow"
          >
            <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
              <span className={`material-symbols-outlined ${cfg.color} text-[16px]`}>
                {cfg.icon}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${cfg.color}`}>
                {label}
              </p>
              <p className="text-xs text-on-surface leading-relaxed truncate" title={msg}>
                {msg}
              </p>
            </div>
            <span className="text-[10px] text-on-surface-variant flex-shrink-0 pt-1">
              {timeAgo(ev.ts)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
