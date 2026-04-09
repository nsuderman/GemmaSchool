import { useEffect, useMemo, useState } from 'react'
import { useProfile } from '../contexts/ProfileContext'
import AgentThinkingSpinner from '../components/AgentThinkingSpinner'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function QuestLoad() {
  const { activeProfile } = useProfile()
  const isParent = activeProfile?.role === 'parent'

  const [profiles, setProfiles] = useState([])
  const [studentId, setStudentId] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [term, setTerm] = useState('Spring')

  const [curriculumList, setCurriculumList] = useState([])
  const [selectedCurriculumId, setSelectedCurriculumId] = useState('')

  const [subject, setSubject] = useState('')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [chatBusy, setChatBusy] = useState(false)

  const [proposal, setProposal] = useState(null)
  const [proposalBusy, setProposalBusy] = useState(false)

  const students = useMemo(() => profiles.filter((p) => p.role === 'student'), [profiles])
  const selectedStudent = students.find((s) => s.id === studentId)

  useEffect(() => {
    fetch(`${API}/profiles`)
      .then((r) => r.json())
      .then((d) => {
        const all = d.profiles || []
        setProfiles(all)
        if (isParent) setStudentId(all.find((p) => p.role === 'student')?.id || '')
      })
      .catch(() => setProfiles([]))
  }, [isParent])

  const loadCurriculum = () => {
    if (!studentId) {
      setCurriculumList([])
      return
    }
    const params = new URLSearchParams({ year: String(year), term })
    fetch(`${API}/curriculum/students/${studentId}?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        const items = d.items || []
        setCurriculumList(items)
        if (!selectedCurriculumId && items[0]) setSelectedCurriculumId(items[0].id)
      })
      .catch(() => setCurriculumList([]))
  }

  useEffect(() => {
    loadCurriculum()
  }, [studentId, year, term])

  const submitCurriculum = async (e) => {
    e.preventDefault()
    setSaveMsg('')
    if (!studentId) return setSaveMsg('Select a student first.')
    if (!subject.trim()) return setSaveMsg('Subject is required.')

    setSaving(true)
    try {
      const body = new FormData()
      body.append('student_id', studentId)
      body.append('subject', subject.trim())
      body.append('year', String(year))
      body.append('term', term)
      if (title.trim()) body.append('title', title.trim())
      if (notes.trim()) body.append('notes', notes.trim())
      if (content.trim()) body.append('content', content.trim())
      if (file) body.append('file', file)

      const res = await fetch(`${API}/curriculum/upload`, { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Upload failed')

      setSaveMsg('Curriculum saved. Select it below to propose schedule.')
      setSubject('')
      setTitle('')
      setNotes('')
      setContent('')
      setFile(null)
      await loadCurriculum()
      setSelectedCurriculumId(data.id)
    } catch (err) {
      setSaveMsg(String(err))
    } finally {
      setSaving(false)
    }
  }

  const sendChat = async () => {
    if (!selectedCurriculumId || !chatInput.trim() || chatBusy) return
    const next = [...chatMessages, { role: 'user', content: chatInput.trim() }]
    setChatMessages(next)
    setChatInput('')
    setChatBusy(true)
    try {
      const res = await fetch(`${API}/planner/curriculum/${selectedCurriculumId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const data = await res.json()
      setChatMessages((prev) => [...prev, { role: 'assistant', content: data.reply || 'No response' }])
    } catch {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Agent unavailable right now.' }])
    } finally {
      setChatBusy(false)
    }
  }

  const generateProposal = async () => {
    if (!selectedCurriculumId || proposalBusy) return
    setProposalBusy(true)
    try {
      const res = await fetch(`${API}/planner/curriculum/${selectedCurriculumId}/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to generate proposal')
      setProposal(data)
    } catch {
      setProposal(null)
    } finally {
      setProposalBusy(false)
    }
  }

  if (!isParent) {
    return (
      <div className="max-w-4xl mx-auto pt-8">
        <div className="bg-surface-container-lowest rounded-xl p-8 editorial-shadow">
          <h2 className="text-2xl font-headline font-bold text-on-surface">Parent Access Required</h2>
          <p className="text-on-surface-variant mt-2">Quest Load is available to parent profiles only.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto pt-4 space-y-8">
      <header>
        <h1 className="text-4xl font-headline font-extrabold tracking-tight text-on-surface mb-2">Quest Load</h1>
        <p className="text-on-surface-variant">Load student curriculum, discuss revisions with the Curriculum Agent, and generate a semester proposal.</p>
      </header>

      <section className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-5 bg-surface-container-lowest rounded-xl p-6 editorial-shadow">
          <h3 className="font-headline font-bold text-on-surface mb-4">Curriculum Intake</h3>
          <form className="space-y-3" onSubmit={submitCurriculum}>
            <div className="grid grid-cols-2 gap-3">
              <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface">
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}{s.grade_level ? ` (Grade ${s.grade_level})` : ''}</option>)}
              </select>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface" placeholder="Subject" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())} className="bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface" />
              <select value={term} onChange={(e) => setTerm(e.target.value)} className="bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface">
                {['Spring', 'Summer', 'Fall', 'Winter'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface" placeholder="Curriculum title" />
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface min-h-16" placeholder="Notes" />
            <textarea value={content} onChange={(e) => setContent(e.target.value)} className="w-full bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface min-h-24" placeholder="Paste curriculum text" />
            <input type="file" accept=".pdf,.txt,.md" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full text-xs text-on-surface-variant" />
            {saveMsg && <p className="text-xs text-on-surface-variant">{saveMsg}</p>}
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-primary text-on-primary rounded-lg text-sm font-bold disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Curriculum'}
            </button>
          </form>
        </div>

        <div className="col-span-12 lg:col-span-7 bg-surface-container-lowest rounded-xl p-6 editorial-shadow">
          <h3 className="font-headline font-bold text-on-surface mb-3">Loaded Curriculum ({year} {term})</h3>
          <div className="space-y-2 max-h-72 overflow-auto pr-1">
            {curriculumList.length === 0 ? <p className="text-sm text-on-surface-variant">No curriculum loaded for this term yet.</p> : curriculumList.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedCurriculumId(item.id)}
                className={`w-full text-left rounded-lg p-3 border ${selectedCurriculumId === item.id ? 'border-primary bg-primary/5' : 'border-outline-variant/20 bg-surface-container-low'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-on-surface truncate">{item.title}</p>
                  <div className="flex gap-1">
                    {item.grade_level && <span className="text-[10px] px-2 py-0.5 rounded-full bg-tertiary-container/30 text-tertiary font-bold">Grade {item.grade_level}</span>}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">{item.subject}</span>
                  </div>
                </div>
                <p className="text-[11px] text-on-surface-variant mt-1">{item.path}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-5 bg-surface-container-lowest rounded-xl p-6 editorial-shadow">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-headline font-bold text-on-surface">Change Discussion</h3>
            <span className="text-[10px] font-bold uppercase text-on-surface-variant">Curriculum Agent</span>
          </div>
          <div className="bg-surface-container-low rounded-lg p-3 h-64 overflow-auto space-y-2">
            {chatMessages.length === 0 ? <p className="text-xs text-on-surface-variant">Ask the agent to adjust pacing, sequence, or workload.</p> : chatMessages.map((m, i) => (
              <div key={i} className={`text-xs rounded-lg px-3 py-2 ${m.role === 'user' ? 'bg-primary/10 text-on-surface ml-6' : 'bg-surface-container-high text-on-surface-variant mr-6'}`}>
                {m.content}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} className="flex-1 bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface" placeholder="Discuss changes..." />
            <button onClick={sendChat} disabled={chatBusy || !selectedCurriculumId} className="px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-50">
              {chatBusy ? <span className="flex items-center gap-2"><AgentThinkingSpinner /><span>Thinking...</span></span> : 'Send'}
            </button>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-7 bg-surface-container-lowest rounded-xl p-6 editorial-shadow">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-headline font-bold text-on-surface">Proposed Student Curriculum</h3>
            <button onClick={generateProposal} disabled={proposalBusy || !selectedCurriculumId} className="px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-50">
              {proposalBusy ? <span className="flex items-center gap-2"><AgentThinkingSpinner /><span>Planning...</span></span> : 'Generate Schedule'}
            </button>
          </div>
          {!proposal ? (
            <p className="text-sm text-on-surface-variant">Generate a proposal to map lessons onto your school calendar and holidays.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-auto pr-1">
              <p className="text-xs text-on-surface-variant mb-2">
                {proposal.subject} · {proposal.semester} · {proposal.sessions.length} planned sessions
              </p>
              {proposal.sessions.map((s) => (
                <div key={s.day} className="bg-surface-container-low rounded-lg p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-on-surface">Day {s.day} · {s.date}</p>
                    <p className="text-sm text-on-surface-variant">{s.lesson}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container">planned</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
