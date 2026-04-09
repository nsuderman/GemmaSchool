import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useWSEvents } from '../contexts/WebSocketContext'
import { useProfile } from '../contexts/ProfileContext'
import ActivityFeed from '../components/ActivityFeed'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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
  const { activeProfile } = useProfile()
  const isParent = activeProfile?.role === 'parent'
  const allEvents  = useWSEvents()   // global shared stream
  const seenRef    = useRef(0)       // track how many events we've processed

  const [emerald, setEmerald]         = useState(false)
  const [mentorNote, setMentorNote]   = useState(
    'Your vault has 0 Daily Quests. Run The Architect to begin your 180-day learning journey.'
  )
  const [agentRunning, setAgentRunning] = useState({})
  const [activeModel, setActiveModel]   = useState(null)
  const [scheduleStats, setScheduleStats] = useState(null)

  useEffect(() => {
    fetch(`${API}/setup/models`)
      .then((r) => r.json())
      .then((data) => {
        const all = [...(data.models || []), ...(data.extra_models || [])]
        setActiveModel(all.find((m) => m.active) || null)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`${API}/vault/graph`)
      .then((r) => r.json())
      .then((data) => {
        const nodes = data?.nodes || []
        const completed = nodes.filter((n) => n.status === 'completed').length
        const dayValues = nodes
          .map((n) => Number(n.day || 0))
          .filter((d) => Number.isFinite(d) && d > 0)

        const totalPlanned = dayValues.length > 0 ? Math.max(...dayValues) : nodes.length
        const pendingDays = nodes
          .filter((n) => n.status !== 'completed')
          .map((n) => Number(n.day || 0))
          .filter((d) => Number.isFinite(d) && d > 0)
          .sort((a, b) => a - b)
        const nextDay = pendingDays[0] || null

        const weekStart = Math.floor(completed / 5) * 5 + 1
        const weekEnd = Math.min(weekStart + 4, totalPlanned || weekStart + 4)
        const plannedThisWeek = nodes.filter((n) => {
          const d = Number(n.day || 0)
          return d >= weekStart && d <= weekEnd
        }).length
        const completedThisWeek = nodes.filter((n) => {
          const d = Number(n.day || 0)
          return n.status === 'completed' && d >= weekStart && d <= weekEnd
        }).length

        setScheduleStats({
          completed,
          totalPlanned,
          remaining: Math.max((totalPlanned || 0) - completed, 0),
          pct: totalPlanned > 0 ? Math.round((completed / totalPlanned) * 100) : 0,
          nextDay,
          weekStart,
          weekEnd,
          plannedThisWeek,
          completedThisWeek,
        })
      })
      .catch(() => setScheduleStats(null))
  }, [allEvents.length])

  // Process only genuinely new events (allEvents is newest-first)
  useEffect(() => {
    const newEvents = allEvents.slice(0, allEvents.length - seenRef.current)
    if (newEvents.length === 0) return
    seenRef.current = allEvents.length

    newEvents.forEach(({ event, data = {} }) => {
      if (event === 'quest.completed' || event === 'quest_completed') {
        setEmerald(true)
        setTimeout(() => setEmerald(false), 4000)
      }
      if (event === 'mentor_note') {
        setMentorNote(data.message || '')
      }
      if (event === 'agent.task.start') {
        setAgentRunning((p) => ({ ...p, [data.agent]: true }))
      }
      if (event === 'agent.task.complete' || event === 'agent.task.error') {
        setAgentRunning((p) => ({ ...p, [data.agent]: false }))
      }
      if (event === 'model.activated' || event === 'system.online') {
        fetch(`${API}/setup/models`)
          .then((r) => r.json())
          .then((d) => {
            const all = [...(d.models || []), ...(d.extra_models || [])]
            setActiveModel(all.find((m) => m.active) || null)
          })
          .catch(() => {})
      }
    })
  }, [allEvents])

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

        {/* Primary hero card */}
        {isParent ? (
          <section className="col-span-12 md:col-span-4 rounded-xl p-8 bg-primary text-on-primary shadow-primary-glow">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-white text-2xl material-symbols-filled">
                timeline
              </span>
            </div>
            <h3 className="text-2xl font-headline font-bold leading-tight mb-2">Student Schedule</h3>
            <p className="text-white/80 text-sm leading-relaxed">
              {scheduleStats?.nextDay
                ? `Currently progressing through Day ${scheduleStats.nextDay} of ${scheduleStats.totalPlanned || 180}.`
                : 'No pending day found yet. Generate quests to establish the schedule.'}
            </p>

            <div className="mt-8 space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span>Completed</span>
                <span>{scheduleStats?.completed ?? 0}</span>
              </div>
              <div className="flex justify-between text-xs font-bold">
                <span>Remaining</span>
                <span>{scheduleStats?.remaining ?? 0}</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-secondary-container rounded-full transition-all duration-500"
                  style={{ width: `${scheduleStats?.pct ?? 0}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-white/80">
                <span>Plan Coverage</span>
                <span>{scheduleStats?.pct ?? 0}%</span>
              </div>
              <div className="text-[11px] text-white/80 pt-1">
                Week {Math.ceil((scheduleStats?.weekStart || 1) / 5)} · Days {scheduleStats?.weekStart || 1}-{scheduleStats?.weekEnd || 5} · {scheduleStats?.completedThisWeek || 0}/{scheduleStats?.plannedThisWeek || 0} complete
              </div>
            </div>
          </section>
        ) : (
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
        )}

        {/* Subject Progress */}
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
            <Link to="/agents" className="text-primary text-xs font-bold hover:underline flex items-center gap-1">
              Manage
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </Link>
          </div>
          <div className="space-y-5">
            {AGENTS.map((agent) => {
              const running = agentRunning[agent.id?.toLowerCase()] || agentRunning[agent.name.toLowerCase()]
              return (
                <div key={agent.name} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center flex-shrink-0">
                    <span className={`material-symbols-outlined ${agent.color} text-[20px]`}>
                      {agent.icon}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold text-on-surface">{agent.name}</span>
                      <span className={`text-xs font-bold ${running ? 'text-primary' : 'text-secondary'}`}>
                        {running ? 'Running' : 'Ready'}
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant">{agent.desc}</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${running ? 'bg-primary animate-pulse' : 'bg-secondary'}`} />
                </div>
              )
            })}
          </div>

          {/* Active model chip */}
          <div className="mt-6 p-4 bg-surface-container-low rounded-lg flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-primary text-[16px]">memory</span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Active Model</p>
                <p className="text-xs font-semibold text-on-surface truncate">
                  {activeModel ? activeModel.label : 'No model active'}
                </p>
              </div>
            </div>
            <Link
              to="/settings/model-manager"
              className="text-[10px] font-bold text-primary hover:underline flex-shrink-0 flex items-center gap-0.5"
            >
              Change
              <span className="material-symbols-outlined text-[12px]">chevron_right</span>
            </Link>
          </div>
        </section>

        {/* Live Activity Feed */}
        <section className="col-span-12 md:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">sensors</span>
              <h3 className="font-headline font-bold text-lg text-on-surface">Live Activity</h3>
            </div>
            </div>
          <ActivityFeed events={allEvents} maxHeight="max-h-[26rem]" />
        </section>
      </div>

      {/* ── Recent Summaries ── */}
      <section className="mt-16">
        <h3 className="font-headline font-bold text-2xl text-on-surface mb-8">Vault Summaries</h3>
        <div className="flex flex-wrap gap-8 items-start">
          <div className="w-full glass-panel ghost-border p-8 rounded-xl editorial-shadow">
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
              live force-directed graph of every quest and its cross-subject connections.
            </p>
            <Link to="/vault" className="text-sm font-bold text-primary flex items-center gap-2 hover:gap-3 transition-all">
              Open Knowledge Grove
              <span className="material-symbols-outlined text-sm">trending_flat</span>
            </Link>
          </div>

        </div>
      </section>
    </div>
  )
}
