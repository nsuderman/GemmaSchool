import { useEffect, useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const SUBJECT_COLORS = {
  mathematics:   { chip: 'bg-primary/10 text-primary',           icon: 'calculate' },
  science:       { chip: 'bg-secondary-container text-on-secondary-container', icon: 'science' },
  history:       { chip: 'bg-tertiary-container/30 text-tertiary', icon: 'history_edu' },
  literature:    { chip: 'bg-primary-container/40 text-on-primary-container', icon: 'menu_book' },
  arts:          { chip: 'bg-secondary-container/60 text-on-secondary-container', icon: 'palette' },
  default:       { chip: 'bg-surface-container-high text-on-surface-variant', icon: 'school' },
}

function subjectStyle(name = '') {
  const key = Object.keys(SUBJECT_COLORS).find((k) =>
    name.toLowerCase().includes(k)
  )
  return SUBJECT_COLORS[key] || SUBJECT_COLORS.default
}

function QuestCard({ quest }) {
  const style = subjectStyle(quest.name)
  return (
    <div className="group flex items-center gap-6 p-5 bg-surface-container-lowest rounded-xl hover:bg-primary-container/10 transition-all cursor-pointer editorial-shadow">
      {/* Subject icon tile */}
      <div className="w-14 h-14 rounded-lg bg-surface-container-high flex items-center justify-center flex-shrink-0 group-hover:bg-primary-container/30 transition-colors">
        <span className={`material-symbols-outlined text-2xl ${style.chip.split(' ')[1]}`}>
          {style.icon}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${style.chip}`}>
            Quest
          </span>
        </div>
        <h4 className="font-headline font-bold text-on-surface truncate">{quest.name}</h4>
        <p className="text-xs text-on-surface-variant mt-0.5">{quest.file}</p>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="px-3 py-1 bg-surface-container-high text-on-surface-variant text-[10px] font-bold rounded-full uppercase">
          Pending
        </span>
        <span className="material-symbols-outlined text-outline text-[18px] group-hover:text-primary transition-colors">
          arrow_forward_ios
        </span>
      </div>
    </div>
  )
}

export default function QuestBoard() {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetch(`${API}/quests/`)
      .then((r) => r.json())
      .then(setQuests)
      .catch(() => setQuests([]))
      .finally(() => setLoading(false))
  }, [])

  const filters = ['all', 'pending', 'completed']

  return (
    <div className="max-w-7xl mx-auto pt-4">
      {/* ── Header ──────────────────────────────────── */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-headline font-extrabold tracking-tight text-on-surface mb-2">
            Daily Quest Board
          </h1>
          <p className="text-on-surface-variant">
            {quests.length > 0
              ? `${quests.length} quests in your 180-day plan`
              : 'Run The Architect to generate your quest plan'}
          </p>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                filter === f
                  ? 'bg-primary text-on-primary shadow-primary-glow'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      {/* ── Stat Row ─────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        {[
          { label: 'Total Quests', value: quests.length, icon: 'map', color: 'text-primary' },
          { label: 'Completed',    value: 0,             icon: 'check_circle', color: 'text-secondary' },
          { label: 'Days Planned', value: quests.length > 0 ? 180 : 0, icon: 'calendar_today', color: 'text-tertiary' },
        ].map((s) => (
          <div key={s.label} className="bg-surface-container-lowest rounded-xl p-6 editorial-shadow">
            <div className="flex items-center gap-3 mb-2">
              <span className={`material-symbols-outlined ${s.color} text-[20px]`}>{s.icon}</span>
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                {s.label}
              </span>
            </div>
            <p className="text-3xl font-headline font-extrabold tracking-tight text-on-surface">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Quest List ───────────────────────────────── */}
      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl shimmer" />
          ))}
        </div>
      )}

      {!loading && quests.length === 0 && (
        <div className="bg-surface-container-lowest rounded-xl p-16 text-center editorial-shadow">
          <div className="w-16 h-16 bg-primary-container/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-primary text-3xl">explore</span>
          </div>
          <h3 className="font-headline font-bold text-xl text-on-surface mb-2">No Quests Yet</h3>
          <p className="text-on-surface-variant text-sm mb-6 max-w-sm mx-auto">
            The Architect agent will parse your curriculum PDFs and generate a full 180-day quest plan stored in your Obsidian Vault.
          </p>
          <button className="px-6 py-3 ai-shimmer text-on-primary rounded-xl text-sm font-bold shadow-primary-glow hover:scale-[1.02] active:scale-95 transition-transform inline-flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            Run The Architect
          </button>
        </div>
      )}

      {!loading && quests.length > 0 && (
        <div className="space-y-3">
          {quests.map((q) => (
            <QuestCard key={q.name} quest={q} />
          ))}
        </div>
      )}
    </div>
  )
}
