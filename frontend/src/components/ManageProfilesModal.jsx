import { useState } from 'react'
import { useProfile, PROFILE_COLORS, getInitials } from '../contexts/ProfileContext'

const COLOR_OPTIONS = [
  { id: 'primary',   label: 'Blue' },
  { id: 'secondary', label: 'Green' },
  { id: 'tertiary',  label: 'Purple' },
  { id: 'indigo',    label: 'Indigo' },
  { id: 'rose',      label: 'Rose' },
  { id: 'amber',     label: 'Amber' },
  { id: 'teal',      label: 'Teal' },
  { id: 'error',     label: 'Red' },
]

function EditProfilePanel({ profile, onClose }) {
  const { updateProfile, deleteProfile, activeProfile } = useProfile()
  const [name, setName]     = useState(profile.name)
  const [color, setColor]   = useState(profile.color)
  const [pin, setPin]       = useState('')
  const [pin2, setPin2]     = useState('')
  const [gradeLevel, setGradeLevel] = useState(profile.grade_level || '')
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const colors = PROFILE_COLORS[color] || PROFILE_COLORS.primary
  const isSelf = activeProfile?.id === profile.id

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    if (pin && !/^\d{4}$/.test(pin)) { setError('PIN must be exactly 4 digits'); return }
    if (pin && pin !== pin2) { setError('PINs do not match'); return }
    setSaving(true); setError('')
    try {
      const body = { name: name.trim(), color }
      if (profile.role === 'student') body.grade_level = gradeLevel.trim()
      if (pin) body.pin = pin
      await updateProfile(profile.id, body)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    setDeleting(true)
    try {
      await deleteProfile(profile.id)
      onClose()
    } catch (e) {
      setError(e.message)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Back */}
      <button onClick={onClose} className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-on-surface font-semibold -mb-1">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        All profiles
      </button>

      {/* Avatar preview */}
      <div className="flex justify-center py-2">
        <div className={`w-16 h-16 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center text-2xl font-headline font-bold shadow-lg`}>
          {getInitials(name || profile.name)}
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-surface-container-high rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Color */}
      <div>
        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">Avatar Color</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map((c) => {
            const cc = PROFILE_COLORS[c.id]
            return (
              <button
                key={c.id}
                onClick={() => setColor(c.id)}
                title={c.label}
                className={`w-7 h-7 rounded-full ${cc.bg} transition-all ${
                  color === c.id ? 'ring-2 ring-offset-1 ring-offset-surface-container-low ring-on-surface scale-110' : 'opacity-60 hover:opacity-100'
                }`}
              />
            )
          })}
        </div>
      </div>

      {/* Change PIN */}
      <div>
        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">
          {profile.has_pin ? 'Change PIN' : 'Set PIN'} <span className="normal-case font-normal">(leave blank to keep current)</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="New PIN"
            className="w-full bg-surface-container-high rounded-xl px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="Confirm"
            className="w-full bg-surface-container-high rounded-xl px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {profile.role === 'student' && (
        <div>
          <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">Grade Level</label>
          <input
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            placeholder="e.g. 4, 7, 10, Kindergarten"
            className="w-full bg-surface-container-high rounded-xl px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      )}

      {error && <p className="text-xs text-error font-semibold">{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-2.5 bg-primary text-on-primary font-bold rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
      >
        {saving && <span className="w-3.5 h-3.5 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />}
        Save Changes
      </button>

      {/* Delete — can't delete yourself */}
      {!isSelf && (
        <div className="border-t border-outline-variant/10 pt-3">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2 text-error text-xs font-bold rounded-xl hover:bg-error/10 transition-colors"
            >
              Delete Profile
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 text-on-surface-variant text-xs font-bold rounded-xl bg-surface-container-high">
                Cancel
              </button>
              <button
                onClick={doDelete}
                disabled={deleting}
                className="flex-1 py-2 text-on-error text-xs font-bold rounded-xl bg-error disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {deleting && <span className="w-3 h-3 border-2 border-on-error border-t-transparent rounded-full animate-spin" />}
                Confirm Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AddProfilePanel({ onClose }) {
  const { createProfile } = useProfile()
  const [name, setName]     = useState('')
  const [role, setRole]     = useState('student')
  const [color, setColor]   = useState('secondary')
  const [gradeLevel, setGradeLevel] = useState('')
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  const colors = PROFILE_COLORS[color] || PROFILE_COLORS.secondary

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      await createProfile({
        name: name.trim(),
        role,
        color,
        pin: null,
        grade_level: role === 'student' ? gradeLevel.trim() : null,
      })
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onClose} className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-on-surface font-semibold -mb-1">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        All profiles
      </button>

      <div className="flex justify-center py-2">
        <div className={`w-16 h-16 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center text-2xl font-headline font-bold shadow-lg`}>
          {name ? getInitials(name) : '?'}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Emma"
          autoFocus
          className="w-full bg-surface-container-high rounded-xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div>
        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">Role</label>
        <div className="flex gap-2">
          {['student', 'parent'].map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold capitalize transition-all ${
                role === r ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">Avatar Color</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map((c) => {
            const cc = PROFILE_COLORS[c.id]
            return (
              <button
                key={c.id}
                onClick={() => setColor(c.id)}
                title={c.label}
                className={`w-7 h-7 rounded-full ${cc.bg} transition-all ${
                  color === c.id ? 'ring-2 ring-offset-1 ring-offset-surface-container-low ring-on-surface scale-110' : 'opacity-60 hover:opacity-100'
                }`}
              />
            )
          })}
        </div>
      </div>

      {role === 'student' && (
        <div>
          <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1.5">Grade Level</label>
          <input
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            placeholder="e.g. 4, 7, 10, Kindergarten"
            className="w-full bg-surface-container-high rounded-xl px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      )}

      <p className="text-[11px] text-on-surface-variant">PIN will be set on first sign-in.</p>

      {error && <p className="text-xs text-error font-semibold">{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-2.5 bg-primary text-on-primary font-bold rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
      >
        {saving && <span className="w-3.5 h-3.5 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />}
        Create Profile
      </button>
    </div>
  )
}

export default function ManageProfilesModal({ onClose }) {
  const { profiles } = useProfile()
  const [editing, setEditing] = useState(null)   // profile object
  const [adding, setAdding]   = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-container-low rounded-3xl p-7 w-96 shadow-2xl max-h-[90vh] overflow-y-auto">

        {editing ? (
          <EditProfilePanel profile={editing} onClose={() => setEditing(null)} />
        ) : adding ? (
          <AddProfilePanel onClose={() => setAdding(false)} />
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-headline font-bold text-on-surface text-lg">Manage Profiles</h3>
              <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-2">
              {profiles.map((p) => {
                const colors = PROFILE_COLORS[p.color] || PROFILE_COLORS.primary
                return (
                  <button
                    key={p.id}
                    onClick={() => setEditing(p)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container transition-colors text-left"
                  >
                    <div className={`w-10 h-10 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center font-bold text-sm flex-shrink-0`}>
                      {getInitials(p.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-on-surface">{p.name}</p>
                      <p className="text-[10px] text-on-surface-variant capitalize">
                        {p.role}
                        {p.role === 'student' && p.grade_level ? ` · Grade ${p.grade_level}` : ''}
                        {' · '}
                        {p.has_pin ? 'PIN set' : 'No PIN'}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant">chevron_right</span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setAdding(true)}
              className="w-full mt-4 py-2.5 rounded-xl border-2 border-dashed border-outline-variant hover:border-primary hover:bg-primary/5 text-sm font-semibold text-on-surface-variant hover:text-primary transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              Add Profile
            </button>
          </>
        )}
      </div>
    </div>
  )
}
