import { useState } from 'react'
import { useProfile, PROFILE_COLORS, getInitials } from '../contexts/ProfileContext'
import PINModal from '../components/PINModal'

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

function AddProfileModal({ onClose, onCreated }) {
  const { createProfile } = useProfile()
  const [name, setName]     = useState('')
  const [role, setRole]     = useState('student')
  const [color, setColor]   = useState('secondary')
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  const colors = PROFILE_COLORS[color] || PROFILE_COLORS.secondary

  // PIN is always set during the picker flow — don't collect it here
  const submit = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      // Create without PIN — picker will prompt to set one on first select
      await createProfile({ name: name.trim(), role, color, pin: null })
      onCreated()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-container-low rounded-3xl p-8 w-96 flex flex-col gap-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-headline font-bold text-on-surface text-lg">New Profile</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Preview avatar */}
        <div className="flex justify-center">
          <div className={`w-20 h-20 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center text-3xl font-headline font-bold shadow-lg`}>
            {name ? getInitials(name) : '?'}
          </div>
        </div>

        {/* Name */}
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

        {/* Role */}
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
                  className={`w-8 h-8 rounded-full ${cc.bg} transition-all ${
                    color === c.id ? 'ring-2 ring-offset-2 ring-offset-surface-container-low ring-on-surface scale-110' : 'opacity-70 hover:opacity-100'
                  }`}
                />
              )
            })}
          </div>
        </div>

        <p className="text-[11px] text-on-surface-variant">
          A PIN will be created on first sign-in.
        </p>

        {error && <p className="text-xs text-error font-semibold">{error}</p>}

        <button
          onClick={submit}
          disabled={saving}
          className="w-full py-3 bg-primary text-on-primary font-bold rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />}
          Create Profile
        </button>
      </div>
    </div>
  )
}

function ProfileCard({ profile, onSelect }) {
  const colors = PROFILE_COLORS[profile.color] || PROFILE_COLORS.primary
  return (
    <button
      onClick={() => onSelect(profile)}
      className="group flex flex-col items-center gap-3 p-6 rounded-3xl bg-surface-container-low hover:bg-surface-container transition-all hover:scale-105 active:scale-98 editorial-shadow"
    >
      <div className="relative">
        <div className={`w-20 h-20 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center text-2xl font-headline font-bold shadow-lg group-hover:shadow-xl transition-shadow`}>
          {getInitials(profile.name)}
        </div>
        {/* Always show lock — PIN is always required */}
        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-surface-container-highest rounded-full flex items-center justify-center shadow">
          <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
            {profile.has_pin ? 'lock' : 'lock_open'}
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="font-headline font-bold text-on-surface text-sm">{profile.name}</p>
        <p className="text-[10px] text-on-surface-variant capitalize mt-0.5">{profile.role}</p>
      </div>
    </button>
  )
}

export default function ProfilePicker() {
  const { profiles, loading, login, verifyPin, updateProfile } = useProfile()

  // pinTarget always gets a PIN modal — mode depends on whether PIN is set
  const [pinTarget, setPinTarget] = useState(null)
  const [showAdd, setShowAdd]     = useState(false)

  // Every profile click opens the PIN modal (enter or setup)
  const handleSelect = (profile) => setPinTarget(profile)

  // Verify existing PIN
  const handlePinVerify = async (pin) => {
    const ok = await verifyPin(pinTarget.id, pin)
    if (ok) { login(pinTarget); setPinTarget(null) }
    return ok
  }

  // Save new PIN then log in
  const handlePinSetup = async (pin) => {
    await updateProfile(pinTarget.id, { pin })
    // Re-fetch the profile to get has_pin: true, then log in
    login({ ...pinTarget, has_pin: true })
    setPinTarget(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-8 py-16">

      {/* Wordmark */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-headline font-extrabold bg-gradient-to-br from-primary to-primary-fixed-dim bg-clip-text text-transparent leading-tight mb-2">
          GemmaSchool
        </h1>
        <p className="text-on-surface-variant text-sm tracking-widest uppercase font-semibold">
          Sovereign Learning
        </p>
      </div>

      <p className="text-on-surface-variant text-sm mb-10">Who's learning today?</p>

      {/* Profile grid — scrollable for many profiles */}
      <div className="flex flex-wrap justify-center gap-4 max-w-3xl max-h-[60vh] overflow-y-auto pb-4">
        {profiles.map((profile) => (
          <ProfileCard key={profile.id} profile={profile} onSelect={handleSelect} />
        ))}

        {/* Add profile */}
        <button
          onClick={() => setShowAdd(true)}
          className="flex flex-col items-center gap-3 p-6 rounded-3xl border-2 border-dashed border-outline-variant hover:border-primary hover:bg-primary/5 transition-all group w-[136px]"
        >
          <div className="w-20 h-20 rounded-full bg-surface-container-high flex items-center justify-center group-hover:bg-primary/10 transition-colors">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant group-hover:text-primary transition-colors">
              person_add
            </span>
          </div>
          <p className="text-xs font-semibold text-on-surface-variant group-hover:text-primary transition-colors">
            Add Profile
          </p>
        </button>
      </div>

      {/* PIN modal — setup mode if no PIN, enter mode if PIN exists */}
      {pinTarget && (
        <PINModal
          profile={pinTarget}
          mode={pinTarget.has_pin ? 'enter' : 'setup'}
          onSuccess={handlePinVerify}
          onSetup={handlePinSetup}
          onCancel={() => setPinTarget(null)}
        />
      )}

      {showAdd && (
        <AddProfileModal
          onClose={() => setShowAdd(false)}
          onCreated={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
