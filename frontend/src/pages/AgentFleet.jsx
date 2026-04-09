import { useState, useEffect, useRef } from 'react'
import { useWSEventsByPrefix } from '../contexts/WebSocketContext'
import ActivityFeed from '../components/ActivityFeed'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'


const AGENTS = [
  {
    id: 'architect',
    name: 'The Architect',
    icon: 'architecture',
    color: 'text-primary',
    bg: 'bg-primary/10',
    desc: 'Curriculum Planner',
    detail: 'Parses curriculum PDFs and generates 180-day Daily Quest Markdown files with YAML frontmatter.',
  },
  {
    id: 'scout',
    name: 'The Scout',
    icon: 'explore',
    color: 'text-secondary',
    bg: 'bg-secondary/10',
    desc: 'Enrichment Agent',
    detail: 'Monitors the vault for new topics and generates widescreen hero images via FastSD CPU.',
  },
  {
    id: 'auditor',
    name: 'The Auditor',
    icon: 'fact_check',
    color: 'text-tertiary',
    bg: 'bg-tertiary/10',
    desc: 'Vision Grader',
    detail: 'Analyzes student worksheet photos using Gemma Vision and marks quests as completed.',
  },
  {
    id: 'director',
    name: 'The Director',
    icon: 'hub',
    color: 'text-primary',
    bg: 'bg-primary/10',
    desc: 'API Orchestrator',
    detail: 'Manages the FastAPI bridge and runs semester sweeps using background task queues.',
  },
]

export default function AgentFleet() {
  const [agentStatus, setAgentStatus] = useState({})  // id -> 'idle' | 'running' | 'done' | 'error'
  const agentEvents = useWSEventsByPrefix('agent.')    // live from global WS context
  const seenRef     = useRef(0)

  useEffect(() => {
    const newEvents = agentEvents.slice(0, agentEvents.length - seenRef.current)
    if (newEvents.length === 0) return
    seenRef.current = agentEvents.length

    newEvents.forEach((payload) => {
      const agent = payload.data?.agent
      if (payload.event === 'agent.task.start')    setAgentStatus((p) => ({ ...p, [agent]: 'running' }))
      if (payload.event === 'agent.task.progress') setAgentStatus((p) => ({ ...p, [agent]: 'running' }))
      if (payload.event === 'agent.task.complete') setAgentStatus((p) => ({ ...p, [agent]: 'done' }))
      if (payload.event === 'agent.task.error')    setAgentStatus((p) => ({ ...p, [agent]: 'error' }))
    })
  }, [agentEvents])

  const runAgent = async (agentId) => {
    setAgentStatus((p) => ({ ...p, [agentId]: 'running' }))
    try {
      await fetch(`${API}/agents/${agentId}/run`, { method: 'POST' })
    } catch {
      setAgentStatus((p) => ({ ...p, [agentId]: 'error' }))
    }
  }

  const STATUS_BADGE = {
    running: { label: 'Running', dot: 'bg-primary animate-pulse', text: 'text-primary' },
    done:    { label: 'Done',    dot: 'bg-secondary',             text: 'text-secondary' },
    error:   { label: 'Error',   dot: 'bg-error',                 text: 'text-error' },
    idle:    { label: 'Ready',   dot: 'bg-secondary',             text: 'text-secondary' },
  }

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <header className="pt-4">
        <h2 className="text-4xl font-headline font-extrabold tracking-tight text-on-surface mb-2">
          Agent Fleet
        </h2>
        <p className="text-on-surface-variant leading-relaxed">
          Run agents manually and watch their activity in real time via WebSocket.
        </p>
      </header>

      {/* Agent cards grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {AGENTS.map((agent) => {
          const status = agentStatus[agent.id] || 'idle'
          const badge = STATUS_BADGE[status]
          const isRunning = status === 'running'

          return (
            <div
              key={agent.id}
              className="bg-surface-container-low rounded-xl p-6 flex flex-col gap-4 editorial-shadow"
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl ${agent.bg} flex items-center justify-center flex-shrink-0`}>
                  <span className={`material-symbols-outlined ${agent.color} text-2xl`}>
                    {agent.icon}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-headline font-bold text-on-surface">{agent.name}</h3>
                    <span className={`flex items-center gap-1 text-[10px] font-bold ${badge.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant font-semibold mb-1">{agent.desc}</p>
                  <p className="text-xs text-on-surface-variant leading-relaxed">{agent.detail}</p>
                </div>
              </div>

              <button
                onClick={() => runAgent(agent.id)}
                disabled={isRunning}
                className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  isRunning
                    ? 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                    : 'bg-primary text-on-primary hover:opacity-90 active:scale-98'
                }`}
              >
                {isRunning ? (
                  <>
                    <span className="w-4 h-4 border-2 border-on-surface-variant border-t-transparent rounded-full animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                    Run {agent.name}
                  </>
                )}
              </button>
            </div>
          )
        })}
      </section>

      {/* Live activity feed */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">sensors</span>
            <h3 className="font-headline font-bold text-on-surface">Live Activity</h3>
          </div>
        </div>
        <ActivityFeed events={agentEvents} maxHeight="max-h-[28rem]" />
      </section>
    </div>
  )
}
