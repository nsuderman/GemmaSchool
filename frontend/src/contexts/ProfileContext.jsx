import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const SESSION_KEY = 'gemmaschool_profile'

const ProfileContext = createContext(null)

// Color map: profile color name → Tailwind classes
export const PROFILE_COLORS = {
  primary:   { bg: 'bg-primary',   text: 'text-on-primary',   ring: 'ring-primary' },
  secondary: { bg: 'bg-secondary', text: 'text-on-secondary', ring: 'ring-secondary' },
  tertiary:  { bg: 'bg-tertiary',  text: 'text-on-tertiary',  ring: 'ring-tertiary' },
  error:     { bg: 'bg-error',     text: 'text-on-error',     ring: 'ring-error' },
  indigo:    { bg: 'bg-indigo-500',  text: 'text-white', ring: 'ring-indigo-500' },
  rose:      { bg: 'bg-rose-500',    text: 'text-white', ring: 'ring-rose-500' },
  amber:     { bg: 'bg-amber-500',   text: 'text-white', ring: 'ring-amber-500' },
  teal:      { bg: 'bg-teal-500',    text: 'text-white', ring: 'ring-teal-500' },
}

export function getInitials(name) {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function ProfileProvider({ children }) {
  const [profiles, setProfiles]     = useState([])
  const [activeProfile, setActive]  = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) } catch { return null }
  })
  const [loading, setLoading]       = useState(true)

  const refreshProfiles = useCallback(async () => {
    try {
      const data = await fetch(`${API}/profiles`).then((r) => r.json())
      setProfiles(data.profiles || [])
    } catch {
      setProfiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refreshProfiles() }, [refreshProfiles])

  // Keep sessionStorage in sync
  useEffect(() => {
    if (activeProfile) sessionStorage.setItem(SESSION_KEY, JSON.stringify(activeProfile))
    else sessionStorage.removeItem(SESSION_KEY)
  }, [activeProfile])

  const login = (profile) => setActive(profile)

  const logout = () => setActive(null)

  const createProfile = async (body) => {
    const res  = await fetch(`${API}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to create profile')
    await refreshProfiles()
  }

  const updateProfile = async (id, body) => {
    const res = await fetch(`${API}/profiles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to update profile')
    await refreshProfiles()
  }

  const deleteProfile = async (id) => {
    const res = await fetch(`${API}/profiles/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to delete profile')
    await refreshProfiles()
  }

  const verifyPin = async (profileId, pin) => {
    const res = await fetch(`${API}/profiles/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId, pin }),
    })
    return res.ok
  }

  return (
    <ProfileContext.Provider value={{
      profiles, activeProfile, loading,
      login, logout, createProfile, updateProfile, deleteProfile, verifyPin, refreshProfiles,
    }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  return useContext(ProfileContext)
}
