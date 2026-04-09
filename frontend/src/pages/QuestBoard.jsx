import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../contexts/ProfileContext'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const SUBJECT_COLORS = {
  mathematics: { chip: 'bg-primary/10 text-primary', icon: 'calculate' },
  science: { chip: 'bg-secondary-container text-on-secondary-container', icon: 'science' },
  history: { chip: 'bg-tertiary-container/30 text-tertiary', icon: 'history_edu' },
  literature: { chip: 'bg-primary-container/40 text-on-primary-container', icon: 'menu_book' },
  arts: { chip: 'bg-secondary-container/60 text-on-secondary-container', icon: 'palette' },
  default: { chip: 'bg-surface-container-high text-on-surface-variant', icon: 'school' },
}

function subjectStyle(name = '') {
  const key = Object.keys(SUBJECT_COLORS).find((k) => name.toLowerCase().includes(k))
  return SUBJECT_COLORS[key] || SUBJECT_COLORS.default
}

function QuestCard({ quest }) {
  const style = subjectStyle(quest.subject || '')
  const done = quest.status === 'completed'
  return (
    <div className="group flex items-center gap-6 p-5 bg-surface-container-lowest rounded-xl hover:bg-primary-container/10 transition-all cursor-pointer editorial-shadow">
      <div className="w-14 h-14 rounded-lg bg-surface-container-high flex items-center justify-center flex-shrink-0 group-hover:bg-primary-container/30 transition-colors">
        <span className={`material-symbols-outlined text-2xl ${style.chip.split(' ')[1]}`}>{style.icon}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${style.chip}`}>
            {quest.subject || 'Quest'}
          </span>
          {quest.day > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-container-high text-on-surface-variant">
              Day {quest.day}
            </span>
          )}
        </div>
        <h4 className="font-headline font-bold text-on-surface truncate">{quest.title || quest.name}</h4>
        <p className="text-xs text-on-surface-variant mt-0.5">{quest.file}</p>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <span className={`px-3 py-1 text-[10px] font-bold rounded-full uppercase ${done ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'}`}>
          {done ? 'Completed' : 'Pending'}
        </span>
      </div>
    </div>
  )
}

export default function QuestBoard() {
  const { activeProfile } = useProfile()
  const isParent = activeProfile?.role === 'parent'

  const [profiles, setProfiles] = useState([])
  const [studentId, setStudentId] = useState('all')
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')

  const students = useMemo(() => profiles.filter((p) => p.role === 'student'), [profiles])

  useEffect(() => {
    fetch(`${API}/profiles`)
      .then((r) => r.json())
      .then((d) => {
        const all = d.profiles || []
        setProfiles(all)
        if (isParent) {
          setStudentId(all.find((p) => p.role === 'student')?.id || 'all')
        } else {
          setStudentId(activeProfile?.id || 'all')
        }
      })
      .catch(() => {
        setProfiles([])
        setStudentId(isParent ? 'all' : activeProfile?.id || 'all')
      })
  }, [isParent, activeProfile?.id])

  useEffect(() => {
    setLoading(true)
    const q = studentId && studentId !== 'all' ? `?student_id=${encodeURIComponent(studentId)}` : ''
    fetch(`${API}/quests/${q}`)
      .then((r) => r.json())
      .then(setQuests)
      .catch(() => setQuests([]))
      .finally(() => setLoading(false))
  }, [studentId])

  const filtered = quests.filter((q) => statusFilter === 'all' || q.status === statusFilter)

  return (
    <div className="max-w-7xl mx-auto pt-4 space-y-8">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-4xl font-headline font-extrabold tracking-tight text-on-surface mb-2">Quest Board</h1>
          <p className="text-on-surface-variant">
            {isParent ? 'Track schedule progress by student.' : 'Track your assigned quests and completion.'}
          </p>
        </div>

        <div className="flex gap-2 items-center">
          {isParent && (
            <Link
              to="/quest-load"
              className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider bg-primary text-on-primary shadow-primary-glow"
            >
              New Quest
            </Link>
          )}
          {isParent && (
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="bg-surface-container-high text-on-surface rounded-full px-4 py-2 text-xs font-bold"
            >
              {students.length === 0 ? <option value="all">No students yet</option> : students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.grade_level ? ` (Grade ${s.grade_level})` : ''}</option>
              ))}
            </select>
          )}
          {['all', 'pending', 'completed'].map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                statusFilter === f ? 'bg-primary text-on-primary shadow-primary-glow' : 'bg-surface-container-high text-on-surface-variant'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest rounded-xl p-6 editorial-shadow">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Total Quests</p>
          <p className="text-3xl font-headline font-extrabold tracking-tight text-on-surface mt-1">{quests.length}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl p-6 editorial-shadow">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Completed</p>
          <p className="text-3xl font-headline font-extrabold tracking-tight text-on-surface mt-1">{quests.filter((q) => q.status === 'completed').length}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl p-6 editorial-shadow">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Pending</p>
          <p className="text-3xl font-headline font-extrabold tracking-tight text-on-surface mt-1">{quests.filter((q) => q.status !== 'completed').length}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-xl shimmer" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-xl p-16 text-center editorial-shadow">
          <h3 className="font-headline font-bold text-xl text-on-surface mb-2">No Quests for This Filter</h3>
          <p className="text-on-surface-variant text-sm max-w-sm mx-auto">
            Use Quest Load to upload curriculum and generate a proposed schedule first.
          </p>
        </div>
      ) : (
        <div className="space-y-3">{filtered.map((q) => <QuestCard key={q.file} quest={q} />)}</div>
      )}
    </div>
  )
}
