import { useEffect, useMemo, useRef, useState } from 'react'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import { useProfile } from '../contexts/ProfileContext'
import AgentThinkingSpinner from '../components/AgentThinkingSpinner'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function toInputDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function normalizeAgentText(text = '') {
  return text
    .replace(/^\*\s+/gm, '• ')
    .replace(/\*\*(.*?)\*\*/g, '$1')
}

function normalizeThinkingText(text = '') {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^\*\s+/gm, '• ')
    .replace(/^\*([^*]+)\*\s*:?/gm, '$1:')
}

export default function CalendarSettings() {
  const { activeProfile } = useProfile()
  const isParent = activeProfile?.role === 'parent'

  const [profiles, setProfiles] = useState([])
  const [calendarSettings, setCalendarSettings] = useState(null)
  const [events, setEvents] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [msg, setMsg] = useState('')
  const [activeTab, setActiveTab] = useState('agent')

  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('holiday')
  const [scope, setScope] = useState(isParent ? 'global' : 'student')
  const [studentId, setStudentId] = useState(activeProfile?.id || '')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [savingEvent, setSavingEvent] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const [agentInput, setAgentInput] = useState('')
  const [agentBusy, setAgentBusy] = useState(false)
  const [threadId] = useState(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
    return `chronos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  })
  const [agentMessages, setAgentMessages] = useState([
    {
      role: 'assistant',
      content: 'I am Chronos. Ask: "What US holidays are in my school year?" then "Load US holidays".',
    },
  ])

  const students = useMemo(() => profiles.filter((p) => p.role === 'student'), [profiles])
  const chatScrollRef = useRef(null)
  useEffect(() => {
    if (!chatScrollRef.current) return
    requestAnimationFrame(() => {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    })
  }, [agentMessages])

  const setAssistantDraft = (updater) => {
    setAgentMessages((prev) => {
      if (prev.length === 0) return prev
      const next = [...prev]
      const idx = next.length - 1
      const last = next[idx]
      if (last.role !== 'assistant' || !last.streaming) return prev
      next[idx] = updater(last)
      return next
    })
  }

  useEffect(() => {
    fetch(`${API}/profiles`)
      .then((r) => r.json())
      .then((d) => {
        const all = d.profiles || []
        setProfiles(all)
        if (isParent) {
          setStudentId(all.find((p) => p.role === 'student')?.id || '')
        } else {
          setStudentId(activeProfile?.id || '')
          setScope('student')
        }
      })
      .catch(() => setProfiles([]))
  }, [isParent, activeProfile?.id])

  const loadAll = async () => {
    const [calRes, evRes] = await Promise.all([
      fetch(`${API}/system-settings/calendar`).then((r) => r.json()).catch(() => null),
      fetch(`${API}/calendar/events?student_id=${encodeURIComponent(activeProfile?.id || '')}`)
        .then((r) => r.json())
        .catch(() => ({ events: [] })),
    ])
    if (calRes) setCalendarSettings(calRes)
    setEvents(evRes?.events || [])
  }

  useEffect(() => { loadAll().catch(() => {}) }, [activeProfile?.id])

  const canEditEvent = (event) => {
    if (isParent) return true
    return event.scope === 'student' && event.student_id === activeProfile?.id
  }

  const beginEdit = (event) => {
    if (!canEditEvent(event)) return
    setActiveTab('add')
    setEditingId(event.id)
    setTitle(event.title || '')
    setKind(event.kind || 'personal')
    setScope(isParent ? (event.scope || 'global') : 'student')
    setStudentId(event.student_id || activeProfile?.id || '')
    setEndDate(event.end_date || event.date || '')
    setNotes(event.notes || '')
    setSelectedDate(event.date ? new Date(`${event.date}T12:00:00`) : new Date())
  }

  const resetForm = () => {
    setEditingId(null)
    setTitle('')
    setKind('holiday')
    setScope(isParent ? 'global' : 'student')
    setStudentId(isParent ? (students[0]?.id || '') : (activeProfile?.id || ''))
    setEndDate('')
    setNotes('')
  }

  const saveCalendar = async () => {
    if (!isParent || !calendarSettings) return
    setMsg('')
    const res = await fetch(`${API}/system-settings/calendar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(calendarSettings),
    })
    if (!res.ok) {
      setMsg('Failed to save school year settings')
      return
    }
    setMsg('School year settings saved')
  }

  const addOrUpdateEvent = async (e) => {
    e.preventDefault()
    if (!title.trim()) return

    const eventScope = isParent ? scope : 'student'
    const eventStudent = eventScope === 'student' ? (isParent ? studentId : activeProfile?.id) : null

    setSavingEvent(true)
    try {
      const endpoint = editingId ? `${API}/calendar/events/${editingId}` : `${API}/calendar/events`
      const res = await fetch(endpoint, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          date: toInputDate(selectedDate),
          end_date: endDate || null,
          kind,
          scope: eventScope,
          student_id: eventStudent,
          notes,
        }),
      })
      if (!res.ok) throw new Error()
      resetForm()
      await loadAll()
      setMsg(editingId ? 'Event updated' : 'Event added')
    } catch {
      setMsg(editingId ? 'Failed to update event' : 'Failed to add event')
    } finally {
      setSavingEvent(false)
    }
  }

  const deleteEvent = async (event) => {
    if (!canEditEvent(event)) return
    const res = await fetch(`${API}/calendar/events/${event.id}`, { method: 'DELETE' })
    if (res.ok) {
      if (editingId === event.id) resetForm()
      await loadAll()
    }
  }

  const sendAgent = async () => {
    if (!agentInput.trim() || agentBusy) return
    const user = { role: 'user', content: agentInput.trim() }
    const nextMessages = [...agentMessages, user]
    setAgentMessages([
      ...nextMessages,
      { role: 'assistant', content: '', thinking: '', streaming: true, thoughtCollapsed: false, actions: [] },
    ])
    setAgentInput('')
    setAgentBusy(true)

    try {
      const res = await fetch(`${API}/calendar/agent/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [user],
          is_parent: isParent,
          student_id: activeProfile?.id,
          thread_id: threadId,
        }),
      })
      if (!res.ok || !res.body) throw new Error('Stream unavailable')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() || ''

        for (const block of blocks) {
          const line = block
            .split('\n')
            .find((l) => l.startsWith('data: '))
          if (!line) continue
          let evt
          try {
            evt = JSON.parse(line.slice(6))
          } catch {
            continue
          }

          if (evt.type === 'thinking') {
            setAssistantDraft((last) => ({
              ...last,
              thinking: `${last.thinking || ''}${evt.delta || ''}`,
            }))
          }

          if (evt.type === 'delta') {
            setAssistantDraft((last) => ({
              ...last,
              content: `${last.content || ''}${evt.delta || ''}`,
            }))
          }

          if (evt.type === 'final') {
            setAssistantDraft((last) => ({
              ...last,
              content: evt.reply || last.content || 'No response',
              thinking: evt.thinking || last.thinking || '',
              actions: evt.actions || [],
              streaming: false,
              thoughtCollapsed: true,
            }))
          }

          if (evt.type === 'error') {
            setAssistantDraft((last) => ({
              ...last,
              content: evt.error || 'Chronos stream failed.',
              streaming: false,
              thoughtCollapsed: true,
            }))
          }
        }
      }

      setAgentMessages((prev) => prev.map((m, i) =>
        i === prev.length - 1 && m.role === 'assistant' && m.streaming
          ? { ...m, streaming: false, thoughtCollapsed: true, content: m.content || 'No response' }
          : m
      ))
      await loadAll()
    } catch {
      setAgentMessages((prev) => prev.map((m, i) =>
        i === prev.length - 1 && m.role === 'assistant' && m.streaming
          ? { ...m, content: 'Chronos is unavailable right now.', streaming: false }
          : m
      ))
    } finally {
      setAgentBusy(false)
    }
  }

  const dateStr = toInputDate(selectedDate)
  const dayEvents = events.filter((e) => e.date <= dateStr && (e.end_date || e.date) >= dateStr)

  const tileClassName = ({ date, view }) => {
    if (view !== 'month') return ''
    const d = toInputDate(date)
    const dayEvents = events.filter((e) => e.date <= d && (e.end_date || e.date) >= d)
    if (dayEvents.length === 0) return ''

    const hasHolidayStyleEvent = dayEvents.some((e) => ['holiday', 'vacation', 'field_trip'].includes((e.kind || '').toLowerCase()))
    return hasHolidayStyleEvent ? 'has-calendar-event has-calendar-holiday' : 'has-calendar-event'
  }

  return (
    <div className="max-w-7xl mx-auto pt-4 space-y-8">
      <header>
        <h2 className="text-4xl font-headline font-extrabold tracking-tight text-on-surface mb-2">Calendar</h2>
        <p className="text-on-surface-variant">Global and student calendars with an AI scheduling assistant.</p>
      </header>

      <section className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7 bg-surface-container-lowest rounded-xl p-6 editorial-shadow">
          <Calendar value={selectedDate} onChange={setSelectedDate} tileClassName={tileClassName} />
          <style>{`.react-calendar{width:100%;background:transparent;border:none;color:#2e3335}.react-calendar__tile--active{background:#005cc0;color:white}.react-calendar__tile--now{background:#d9f2ea;color:#1c6d25}.react-calendar__tile--now:enabled:hover,.react-calendar__tile--now:enabled:focus{background:#b7e6d8}.has-calendar-event{position:relative;background:rgba(88,166,255,.14);box-shadow:inset 0 0 0 1px rgba(88,166,255,.35);border-radius:8px}.has-calendar-holiday{background:rgba(88,166,255,.2);box-shadow:inset 0 0 0 1px rgba(88,166,255,.55), inset 0 -2px 0 0 rgba(88,166,255,.9)}.has-calendar-event:after{content:'';position:absolute;left:50%;transform:translateX(-50%);bottom:4px;width:6px;height:6px;border-radius:999px;background:#58a6ff}`}</style>
        </div>

        <div className="col-span-12 lg:col-span-5 bg-surface-container-lowest rounded-xl p-6 editorial-shadow space-y-4">
          <h3 className="font-headline font-bold text-on-surface">{dateStr}</h3>
          {dayEvents.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No events on this date.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-auto pr-1">
              {dayEvents.map((e) => (
                <div key={e.id} className="bg-surface-container-low rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-on-surface">{e.title}</p>
                    <div className="flex items-center gap-2">
                      {canEditEvent(e) && <button onClick={() => beginEdit(e)} className="text-xs text-primary font-bold">Edit</button>}
                      {canEditEvent(e) && <button onClick={() => deleteEvent(e)} className="text-xs text-error font-bold">Delete</button>}
                    </div>
                  </div>
                  <p className="text-[11px] text-on-surface-variant mt-1 capitalize">
                    {e.kind} · {e.scope}{e.student_id ? ` (${students.find((s) => s.id === e.student_id)?.name || 'Student'})` : ''}
                  </p>
                  {e.end_date && e.end_date !== e.date && (
                    <p className="text-[11px] text-on-surface-variant">{e.date} → {e.end_date}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-surface-container-lowest rounded-xl p-6 editorial-shadow space-y-4">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'agent', label: 'Chronos' },
            { id: 'school-year', label: 'Global School Year' },
            { id: 'add', label: editingId ? 'Edit Event' : 'Add Event' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                activeTab === t.id ? 'bg-primary text-on-primary shadow-primary-glow' : 'bg-surface-container-high text-on-surface-variant'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'agent' && (
          <div className="space-y-3">
            <p className="text-xs text-on-surface-variant">The agent can query and apply calendar changes with tools (list/create/update/delete/import US holidays).</p>
            <div className="bg-surface-container-low rounded-lg p-3 h-[30rem] min-h-0 overflow-hidden flex flex-col">
              <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2 pr-1">
                {agentMessages.map((m, i) => (
                  <div key={i} className={`text-xs rounded-lg px-3 py-2 whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary/10 text-on-surface ml-8' : 'bg-surface-container-high text-on-surface-variant mr-8'}`}>
                    {m.role === 'assistant' && m.thinking && (
                      <details className="mt-2" open={!m.thoughtCollapsed}>
                        <summary className="cursor-pointer text-[10px] text-on-surface-variant/90">Show thinking</summary>
                        <p className="mt-1 text-[10px] text-on-surface-variant/90 whitespace-pre-wrap">{normalizeThinkingText(m.thinking)}</p>
                      </details>
                    )}
                    {m.role === 'assistant' ? normalizeAgentText(m.content) : m.content}
                  </div>
                ))}
              </div>

              <div className="pt-3 mt-3 border-t border-outline-variant/20 flex gap-2">
                <input
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendAgent()
                    }
                  }}
                  className="flex-1 bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface"
                  placeholder="Ask Chronos..."
                />
                <button onClick={sendAgent} disabled={agentBusy} className="px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-50">
                  {agentBusy ? (
                    <span className="flex items-center gap-2"><AgentThinkingSpinner /><span>Thinking...</span></span>
                  ) : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'school-year' && (
          <div className="space-y-3">
            {!isParent ? (
              <p className="text-sm text-on-surface-variant">Students can view school year settings but only parents can update them.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={calendarSettings?.school_year_start || ''} onChange={(e) => setCalendarSettings((p) => ({ ...(p || {}), school_year_start: e.target.value }))} className="bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface" />
                  <input type="date" value={calendarSettings?.school_year_end || ''} onChange={(e) => setCalendarSettings((p) => ({ ...(p || {}), school_year_end: e.target.value }))} className="bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface" />
                </div>
                <button onClick={saveCalendar} className="px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold">Save School Year</button>
              </>
            )}
          </div>
        )}

        {activeTab === 'add' && (
          <form onSubmit={addOrUpdateEvent} className="space-y-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface" placeholder="Event title" />
            <div className="grid grid-cols-1 gap-3">
              <select value={kind} onChange={(e) => setKind(e.target.value)} className="bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface capitalize">
                {['holiday', 'vacation', 'field_trip', 'personal'].map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Start Date</p>
                <input type="date" value={dateStr} onChange={(e) => setSelectedDate(new Date(`${e.target.value}T12:00:00`))} className="w-full bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">End Date (Optional)</p>
                <input type="date" value={endDate || ''} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface" />
              </div>
            </div>

            {isParent && (
              <div className="grid grid-cols-2 gap-3">
                <select value={scope} onChange={(e) => setScope(e.target.value)} className="bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface">
                  <option value="global">Global (all students)</option>
                  <option value="student">Student only</option>
                </select>
                <select value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={scope !== 'student'} className="bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface disabled:opacity-50">
                  {students.map((s) => <option key={s.id} value={s.id}>{s.name}{s.grade_level ? ` (Grade ${s.grade_level})` : ''}</option>)}
                </select>
              </div>
            )}

            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface min-h-20" placeholder="Notes" />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={savingEvent} className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-50">
                {savingEvent ? (editingId ? 'Saving...' : 'Adding...') : (editingId ? 'Save Event' : 'Add Event')}
              </button>
              {editingId && <button type="button" onClick={resetForm} className="px-3 py-2 rounded-lg bg-surface-container-high text-on-surface-variant text-xs font-bold">Cancel</button>}
            </div>
          </form>
        )}

        {msg && <p className="text-xs text-on-surface-variant">{msg}</p>}
      </section>
    </div>
  )
}
