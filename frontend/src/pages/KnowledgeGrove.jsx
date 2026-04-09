import { useEffect, useState, useRef, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Subject colour palette (Stitch tokens mapped to hex) ─────
const SUBJECT_COLORS = {
  'Mathematics':    '#005cc0',
  'Language Arts':  '#7c3aed',
  'Natural Science':'#1c6d25',
  'History':        '#835600',
  'Creative Arts':  '#c026d3',
  'Technology':     '#0891b2',
  'Physics':        '#0e7490',
  'Chemistry':      '#65a30d',
  'Geography':      '#d97706',
  'General':        '#767c7e',
}

const STATUS_RING = {
  completed:     '#1c6d25',
  pending:       '#005cc0',
  knowledge_gap: '#feaa00',
}

function subjectColor(subject) {
  return SUBJECT_COLORS[subject] || SUBJECT_COLORS['General']
}

// ── Stat chip ─────────────────────────────────────────────────
function StatChip({ icon, label, value, color = 'text-on-surface' }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl px-5 py-4 editorial-shadow flex items-center gap-3">
      <span className={`material-symbols-outlined ${color} text-[22px]`}>{icon}</span>
      <div>
        <p className="text-2xl font-headline font-extrabold tracking-tight text-on-surface leading-none">
          {value}
        </p>
        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mt-0.5">
          {label}
        </p>
      </div>
    </div>
  )
}

// ── Quest detail panel ────────────────────────────────────────
function DetailPanel({ node, onClose }) {
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (!node) return
    fetch(`${API}/vault/quests/${node.id}`)
      .then((r) => r.json())
      .then(setDetail)
      .catch(() => setDetail(null))
  }, [node])

  if (!node) return null

  const ringColor = node.knowledge_gap
    ? STATUS_RING.knowledge_gap
    : STATUS_RING[node.status] || STATUS_RING.pending

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-surface-container-lowest editorial-shadow flex flex-col z-10 rounded-r-xl overflow-hidden">
      {/* Colour bar */}
      <div className="h-1.5 w-full" style={{ backgroundColor: subjectColor(node.subject) }} />

      <div className="p-6 flex-1 overflow-y-auto space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: subjectColor(node.subject) }}
            >
              {node.subject}
            </span>
            <h3 className="font-headline font-bold text-lg text-on-surface leading-tight mt-0.5">
              {node.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface flex-shrink-0 mt-0.5"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap gap-2">
          <span
            className="px-3 py-1 rounded-full text-[10px] font-bold uppercase"
            style={{
              backgroundColor: `${ringColor}20`,
              color: ringColor,
            }}
          >
            {node.knowledge_gap ? 'Knowledge Gap' : node.status}
          </span>
          {node.day > 0 && (
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-surface-container-high text-on-surface-variant">
              Day {node.day}
            </span>
          )}
        </div>

        {/* Body content */}
        {detail?.body ? (
          <div className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
            {detail.body}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="h-3 shimmer rounded" />
            <div className="h-3 shimmer rounded w-4/5" />
            <div className="h-3 shimmer rounded w-3/5" />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t-0 bg-surface-container-low space-y-2">
        <button className="w-full py-2.5 ai-shimmer text-on-primary rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-primary-glow">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          Mark Complete
        </button>
        <button className="w-full py-2.5 ghost-border text-on-surface-variant rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-surface-container transition-colors">
          <span className="material-symbols-outlined text-[16px]">edit</span>
          Edit Quest
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function KnowledgeGrove() {
  const [graphData, setGraphData]     = useState({ nodes: [], links: [] })
  const [stats, setStats]             = useState(null)
  const [loading, setLoading]         = useState(true)
  const [selectedNode, setSelected]   = useState(null)
  const [filterSubject, setFilterSub] = useState('All')
  const [filterStatus, setFilterSt]   = useState('All')
  const containerRef = useRef(null)
  const [dims, setDims] = useState({ w: 800, h: 600 })

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      setDims({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Fetch graph data
  useEffect(() => {
    fetch(`${API}/vault/graph`)
      .then((r) => r.json())
      .then((data) => {
        setGraphData({ nodes: data.nodes, links: data.links })
        setStats(data.stats)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Filtered graph
  const filtered = {
    nodes: graphData.nodes.filter((n) => {
      if (filterSubject !== 'All' && n.subject !== filterSubject) return false
      if (filterStatus  !== 'All' && n.status  !== filterStatus)  return false
      return true
    }),
    links: graphData.links.filter((l) => {
      const visibleIds = new Set(
        graphData.nodes
          .filter((n) => {
            if (filterSubject !== 'All' && n.subject !== filterSubject) return false
            if (filterStatus  !== 'All' && n.status  !== filterStatus)  return false
            return true
          })
          .map((n) => n.id)
      )
      return visibleIds.has(l.source?.id ?? l.source) &&
             visibleIds.has(l.target?.id ?? l.target)
    }),
  }

  // Custom node renderer
  const paintNode = useCallback((node, ctx, globalScale) => {
    const r      = node.knowledge_gap ? 7 : 5
    const fill   = subjectColor(node.subject)
    const ring   = node.knowledge_gap ? STATUS_RING.knowledge_gap : STATUS_RING[node.status]
    const isSelected = selectedNode?.id === node.id
    const alpha  = node.status === 'completed' ? 1 : 0.65

    ctx.globalAlpha = alpha

    // Outer ring (status / gap)
    ctx.beginPath()
    ctx.arc(node.x, node.y, r + 2.5, 0, 2 * Math.PI)
    ctx.fillStyle = isSelected ? '#005cc0' : ring
    ctx.fill()

    // Inner fill (subject)
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fillStyle = fill
    ctx.fill()

    ctx.globalAlpha = 1

    // Label at reasonable zoom
    if (globalScale >= 1.5 || isSelected) {
      const label    = node.title.length > 22 ? node.title.slice(0, 22) + '…' : node.title
      const fontSize = Math.max(10 / globalScale, 3)
      ctx.font       = `${fontSize}px Inter`
      ctx.fillStyle  = '#2e3335'
      ctx.textAlign  = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(label, node.x, node.y + r + 3)
    }
  }, [selectedNode])

  const subjects = ['All', ...(stats?.subjects ?? [])]
  const statuses = ['All', 'pending', 'completed']

  return (
    <div className="max-w-7xl mx-auto pt-4 space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-headline font-extrabold tracking-tight text-on-surface mb-2">
            Knowledge Grove
          </h1>
          <p className="text-on-surface-variant">
            A living map of your student's connected knowledge — every node a quest, every edge a link.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1 bg-surface-container-high rounded-full px-1 py-1">
            {subjects.map((s) => (
              <button
                key={s}
                onClick={() => setFilterSub(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  filterSubject === s
                    ? 'bg-primary text-on-primary shadow-primary-glow'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-surface-container-high rounded-full px-1 py-1">
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setFilterSt(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all capitalize ${
                  filterStatus === s
                    ? 'bg-primary text-on-primary shadow-primary-glow'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatChip icon="map"          label="Total Quests"    value={stats.total}          color="text-primary" />
          <StatChip icon="check_circle" label="Completed"       value={stats.completed}      color="text-secondary" />
          <StatChip icon="radio_button_unchecked" label="Pending" value={stats.pending}      color="text-on-surface-variant" />
          <StatChip icon="warning"      label="Knowledge Gaps"  value={stats.knowledge_gaps} color="text-tertiary" />
        </div>
      )}

      {/* Graph canvas */}
      <div className="relative bg-surface-container-lowest rounded-xl editorial-shadow overflow-hidden"
           style={{ height: '60vh' }}>
        <div ref={containerRef} className="w-full h-full">

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-on-surface-variant">Loading Knowledge Grove…</p>
              </div>
            </div>
          )}

          {!loading && filtered.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-sm px-4">
                <div className="w-16 h-16 bg-primary-container/30 rounded-full flex items-center justify-center mx-auto">
                  <span className="material-symbols-outlined text-primary text-3xl">account_tree</span>
                </div>
                <h3 className="font-headline font-bold text-xl text-on-surface">Grove is empty</h3>
                <p className="text-on-surface-variant text-sm">
                  Run the Architect agent to generate Daily Quests. As quests are created with{' '}
                  <code className="font-mono text-primary text-xs">[[wikilinks]]</code>, connections
                  will appear here.
                </p>
              </div>
            </div>
          )}

          {!loading && filtered.nodes.length > 0 && (
            <ForceGraph2D
              width={dims.w - (selectedNode ? 320 : 0)}
              height={dims.h}
              graphData={filtered}
              nodeCanvasObject={paintNode}
              nodePointerAreaPaint={(node, color, ctx) => {
                ctx.fillStyle = color
                ctx.beginPath()
                ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI)
                ctx.fill()
              }}
              linkColor={() => 'rgba(174,179,181,0.4)'}
              linkWidth={1}
              backgroundColor="#ffffff"
              onNodeClick={(node) =>
                setSelected((prev) => (prev?.id === node.id ? null : node))
              }
              nodeLabel={(node) =>
                `${node.title} · ${node.subject} · ${node.status}`
              }
              cooldownTicks={120}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.4}
            />
          )}
        </div>

        {/* Detail panel */}
        <DetailPanel node={selectedNode} onClose={() => setSelected(null)} />

        {/* Legend */}
        {filtered.nodes.length > 0 && (
          <div className="absolute bottom-4 left-4 glass-panel ghost-border rounded-xl p-4 space-y-2 text-xs">
            <p className="font-bold text-on-surface-variant uppercase tracking-wider text-[10px]">
              Legend
            </p>
            {[
              { color: STATUS_RING.completed,     label: 'Completed' },
              { color: STATUS_RING.pending,        label: 'Pending' },
              { color: STATUS_RING.knowledge_gap,  label: 'Knowledge Gap' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-on-surface-variant">{label}</span>
              </div>
            ))}
            <p className="font-bold text-on-surface-variant uppercase tracking-wider text-[10px] pt-1">
              Subject colours
            </p>
            {Object.entries(SUBJECT_COLORS)
              .filter(([k]) => k !== 'General')
              .slice(0, 5)
              .map(([subject, color]) => (
                <div key={subject} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-on-surface-variant">{subject}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Obsidian optional note */}
      <div className="flex items-start gap-3 p-4 bg-surface-container-low rounded-xl">
        <span className="material-symbols-outlined text-outline text-[20px] flex-shrink-0 mt-0.5">
          info
        </span>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          <strong className="text-on-surface">Optional:</strong> The <code className="font-mono text-primary">vault/</code> folder
          is plain Markdown — you can also open it in{' '}
          <strong className="text-on-surface">Obsidian</strong> for its native graph view and note editor.
          Everything GemmaSchool writes is 100% compatible.
        </p>
      </div>
    </div>
  )
}
