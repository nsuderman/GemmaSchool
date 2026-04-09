import { useState, useCallback } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'

const AGENTS = [
  { name: 'Architect', icon: 'architecture',  color: 'text-primary',   desc: 'Curriculum Planner' },
  { name: 'Scout',     icon: 'explore',        color: 'text-secondary', desc: 'Enrichment Agent' },
  { name: 'Auditor',   icon: 'fact_check',     color: 'text-tertiary',  desc: 'Vision Grader' },
  { name: 'Director',  icon: 'hub',            color: 'text-primary',   desc: 'API Orchestrator' },
]

const SUBJECTS = [
  { label: 'Mathematics',    pct: 85,  color: 'bg-primary' },
  { label: 'Language Arts',  pct: 72,  color: 'bg-secondary' },
  { label: 'Natural Science', pct: 60, color: 'bg-primary' },
  { label: 'History',        pct: 90,  color: 'bg-secondary' },
  { label: 'Creative Arts',  pct: 45,  color: 'bg-tertiary-container' },
  { label: 'Technology',     pct: 78,  color: 'bg-primary' },
]

export default function Dashboard() {
  const [emerald, setEmerald] = useState(false)
  const [events, setEvents] = useState([])
  const [mentorNote, setMentorNote] = useState(
    'Your vault has 0 Daily Quests. Run The Architect to begin your 180-day learning journey.'
  )

  const onMessage = useCallback((payload) => {
    setEvents((prev) => [payload, ...prev].slice(0, 10))
    if (payload.event === 'quest_completed') {
      setEmerald(true)
      setTimeout(() => setEmerald(false), 4000)
    }
    if (payload.event === 'mentor_note') {
      setMentorNote(payload.data?.message || mentorNote)
    }
  }, [])

  useWebSocket(onMessage)

  return (
    <div className="max-w-7xl mx-auto">
      {/* ── Welcome Header ─────────────────────────────── */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12 pt-4">
        <div>
          <h2 className="text-4xl font-headline font-extrabold tracking-tight text-on-surface mb-2">
            Welcome back.
          </h2>
          <p className="text-on-surface-variant max-w-md leading-relaxed">
            Your AI fleet is standing by. Drop curriculum PDFs to start building quests.
          </p>
        </div>

        {/* AI Mentor Feedback — glassmorphism */}
        <div className="glass-panel ghost-border editorial-shadow p-5 rounded-xl max-w-sm w-full">
          <div className="flex items-start gap-3">
            <div className="bg-tertiary-container p-2 rounded-lg flex-shrink-0">
              <span className="material-symbols-outlined text-on-tertiary-container text-[20px] material-symbols-filled">
                auto_awesome
              </span>
            </div>
            <div>
              <p className="text-[10px] font-bold font-headline uppercase tracking-wider text-tertiary mb-1">
                Mentor Insight
              </p>
              <p className="text-sm text-on-surface leading-relaxed">{mentorNote}</p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Bento Grid ─────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-6">

        {/* Emerald Glow + Streak — primary hero card */}
        <section
          className={`col-span-12 md:col-span-4 rounded-xl p-8 flex flex-col justify-between transition-all duration-700 ${
            emerald
              ? 'bg-secondary text-on-secondary emerald-glow'
              : 'bg-primary text-on-primary shadow-primary-glow'
          }`}
        >
          <div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-white text-2xl material-symbols-filled">
                {emerald ? 'check_circle' : 'emoji_events'}
              </span>
            </div>
            <h3 className="text-2xl font-headline font-bold leading-tight mb-2">
              {emerald ? 'Quest Complete!' : 'Daily Challenge'}
            </h3>
            <p className="text-white/80 text-sm leading-relaxed">
              {emerald
                ? 'The Emerald Glow activates. Knowledge grows.'
                : 'Complete 3 quests today to unlock the Weekend Explorer badge.'}
            </p>
          </div>
          <div className="mt-8">
            <div className="flex justify-between text-xs font-bold mb-2">
              <span>Weekly Streak</span>
              <span>0 Days</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-secondary-container w-0 rounded-full transition-all duration-500" />
            </div>
          </div>
        </section>

        {/* Subject Progress — bento medium */}
        <section className="col-span-12 md:col-span-8 bg-surface-container-low rounded-xl p-8 relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-primary-container/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-lg font-headline font-bold text-on-surface">
                  Curriculum Progress
                </h3>
                <p className="text-sm text-on-surface-variant">180-Day Quest Coverage</p>
              </div>
              <span className="px-3 py-1 bg-secondary-container text-on-secondary-container text-[10px] font-bold rounded-full">
                0 Quests Generated
              </span>
            </div>
            <div className="h-40 flex items-end justify-between gap-2">
              {SUBJECTS.map((s) => (
                <div key={s.label} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full ${s.color} opacity-30 rounded-t-lg transition-all hover:opacity-60`}
                    style={{ height: `${s.pct}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-3">
              {SUBJECTS.map((s) => (
                <span key={s.label} className="text-[9px] font-bold text-outline-variant uppercase tracking-tighter flex-1 text-center">
                  {s.label.split(' ')[0]}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Agent Fleet Status */}
        <section className="col-span-12 md:col-span-5 bg-surface-container-lowest rounded-xl p-8 editorial-shadow">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-headline font-bold text-on-surface">Agent Fleet</h3>
            <span className="material-symbols-outlined text-outline text-[20px]">more_horiz</span>
          </div>
          <div className="space-y-5">
            {AGENTS.map((agent) => (
              <div key={agent.name} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center flex-shrink-0">
                  <span className={`material-symbols-outlined ${agent.color} text-[20px]`}>
                    {agent.icon}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold text-on-surface">{agent.name}</span>
                    <span className="text-xs text-secondary font-bold">Ready</span>
                  </div>
                  <p className="text-xs text-on-surface-variant">{agent.desc}</p>
                </div>
                <span className="w-2 h-2 rounded-full bg-secondary flex-shrink-0" />
              </div>
            ))}
          </div>

          {/* AI Insight chip */}
          <div className="mt-6 p-4 bg-tertiary-container/10 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-tertiary text-[16px]">lightbulb</span>
              <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider">
                AI Suggestion
              </span>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Add GGUF models to <code className="font-mono text-primary">/models</code> then run the Architect to auto-generate your first semester plan.
            </p>
          </div>
        </section>

        {/* Live Event Feed */}
        <section className="col-span-12 md:col-span-7 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-headline font-bold text-lg text-on-surface">Recent Activity</h3>
            <button className="text-primary text-xs font-bold hover:underline">View All</button>
          </div>

          {events.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-xl p-8 text-center editorial-shadow">
              <span className="material-symbols-outlined text-outline text-4xl block mb-3">
                radio_button_unchecked
              </span>
              <p className="text-on-surface-variant text-sm">
                Awaiting student activity via WebSocket...
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((ev, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-4 bg-surface-container-lowest rounded-xl hover:bg-primary-container/10 transition-colors cursor-pointer editorial-shadow"
                >
                  <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-primary text-[18px]">
                      bolt
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-primary uppercase tracking-widest mb-0.5">
                      {ev.event}
                    </p>
                    <p className="text-sm font-semibold text-on-surface truncate">
                      {JSON.stringify(ev.data)}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-outline text-[18px]">
                    arrow_forward_ios
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Recent Summaries — asymmetric editorial layout ── */}
      <section className="mt-16">
        <h3 className="font-headline font-bold text-2xl text-on-surface mb-8">Vault Summaries</h3>
        <div className="flex flex-wrap gap-8 items-start">
          <div className="w-full md:w-[45%] glass-panel ghost-border p-8 rounded-xl editorial-shadow">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-3xl">summarize</span>
                <div>
                  <p className="text-[10px] font-bold text-outline-variant uppercase">Vault Status</p>
                  <h4 className="font-headline font-bold text-on-surface">Knowledge Grove</h4>
                </div>
              </div>
              <span className="px-3 py-1 bg-surface-container-highest rounded-full text-[10px] font-bold text-on-surface-variant">
                0 Notes
              </span>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
              Once the Architect generates Daily Quests, the Knowledge Grove will render a
              live force-directed graph of every quest and its cross-subject connections —
              built right into the app.
            </p>
            <a href="/vault" className="text-sm font-bold text-primary flex items-center gap-2 hover:gap-3 transition-all">
              Open Knowledge Grove
              <span className="material-symbols-outlined text-sm">trending_flat</span>
            </a>
          </div>

          <div className="w-full md:w-[48%] bg-surface-container-high/50 p-8 rounded-xl mt-12">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-secondary text-3xl">psychology</span>
              <div>
                <p className="text-[10px] font-bold text-outline-variant uppercase">System Ready</p>
                <h4 className="font-headline font-bold text-on-surface">Fleet Online</h4>
              </div>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
              All four agents are initialized and awaiting tasks. The Auditor is ready for vision
              analysis once Gemma 4 E4B Vision GGUF is loaded in <code className="font-mono text-primary">/models</code>.
            </p>
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-lg hover:opacity-90 transition-opacity">
                Run Architect
              </button>
              <button className="px-4 py-2 ghost-border text-xs font-bold rounded-lg hover:bg-surface-container transition-colors text-on-surface">
                View Docs
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
