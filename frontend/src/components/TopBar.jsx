import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWSLatest } from '../contexts/WebSocketContext'
import { useProfile, PROFILE_COLORS, getInitials } from '../contexts/ProfileContext'
import ManageProfilesModal from './ManageProfilesModal'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function TopBar() {
  const navigate = useNavigate()
  const { activeProfile, logout } = useProfile()
  const [llamaOk, setLlamaOk]         = useState(null)
  const [dropdownOpen, setDropdown]   = useState(false)
  const [showManage, setShowManage]   = useState(false)
  const dropdownRef                    = useRef(null)

  const systemEvent    = useWSLatest('system.')
  const isParent       = activeProfile?.role === 'parent'
  const colors         = PROFILE_COLORS[activeProfile?.color] || PROFILE_COLORS.primary

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Health poll — every 10s
  useEffect(() => {
    const check = () => {
      fetch(`${API}/health`)
        .then((r) => r.json())
        .then((data) => setLlamaOk(data.llama_reachable === true))
        .catch(() => setLlamaOk(false))
    }
    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [])

  // Fast-poll when WS signals a restart
  useEffect(() => {
    if (!systemEvent) return
    if (systemEvent.event === 'system.restarting') {
      setLlamaOk(false)
      let attempts = 0
      const poll = setInterval(() => {
        attempts++
        fetch(`${API}/health`)
          .then((r) => r.json())
          .then((data) => { if (data.llama_reachable) { setLlamaOk(true); clearInterval(poll) } })
          .catch(() => {})
        if (attempts > 40) clearInterval(poll)
      }, 3000)
    }
    if (systemEvent.event === 'system.online')         setLlamaOk(true)
    if (systemEvent.event === 'system.restart_failed') setLlamaOk(false)
  }, [systemEvent])

  const isRestarting = systemEvent?.event === 'system.restarting' && !llamaOk

  const statusDot =
    isRestarting     ? 'bg-primary animate-ping' :
    llamaOk === null ? 'bg-outline animate-pulse' :
    llamaOk          ? 'bg-secondary animate-pulse' :
                       'bg-error'

  const statusLabel =
    isRestarting     ? 'Switching…' :
    llamaOk === null ? 'Checking…' :
    llamaOk          ? 'llama.cpp' :
                       'Offline'

  return (
    <>
    <header className="fixed top-0 right-0 w-[calc(100%-16rem)] z-40 glass-topbar flex justify-between items-center h-16 px-8">
      {/* Search */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <div className="relative w-full bg-surface-container-high rounded-full px-4 py-2 flex items-center gap-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <span className="material-symbols-outlined text-outline text-[20px]">search</span>
          <input
            type="text"
            placeholder="Search quests, subjects, or vault..."
            className="bg-transparent border-none focus:outline-none focus:ring-0 text-sm w-full text-on-surface placeholder:text-on-surface-variant"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* llama.cpp status pill */}
        <div className={`flex items-center gap-2 text-xs bg-surface-container rounded-full px-3 py-1.5 select-none ${
          llamaOk === false && !isRestarting ? 'text-error' : 'text-on-surface-variant'
        }`}>
          <span className={`w-2 h-2 rounded-full ${statusDot}`} />
          {statusLabel}
        </div>

        <button className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors relative">
          <span className="material-symbols-outlined text-[22px]">notifications</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full" />
        </button>

        {/* User account button + dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdown((o) => !o)}
            className="flex items-center gap-2 pl-1 pr-3 py-1 hover:bg-surface-container-high rounded-full transition-colors"
          >
            <div className={`w-8 h-8 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center font-bold text-sm flex-shrink-0`}>
              {activeProfile ? getInitials(activeProfile.name) : '?'}
            </div>
            <span className="text-xs font-semibold text-on-surface hidden sm:block">
              {activeProfile?.name}
            </span>
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
              {dropdownOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {/* Dropdown panel */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-surface-container-low rounded-2xl shadow-lg border border-outline-variant/20 overflow-hidden z-50">
              {/* User info header */}
              <div className="px-4 py-4 border-b border-outline-variant/10">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center font-bold text-sm`}>
                    {activeProfile ? getInitials(activeProfile.name) : '?'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-on-surface">{activeProfile?.name}</p>
                    <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isParent ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'
                    }`}>
                      {isParent ? 'Parent' : 'Student'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-2">
                <p className="px-4 pt-1 pb-1.5 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                  System
                </p>

                {/* Model Manager — parent only */}
                <button
                  onClick={() => { navigate('/settings'); setDropdown(false) }}
                  disabled={!isParent}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${
                    isParent
                      ? 'text-on-surface hover:bg-surface-container-high cursor-pointer'
                      : 'text-on-surface-variant opacity-40 cursor-not-allowed'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] text-primary">memory</span>
                  <div>
                    <p className="font-semibold leading-tight">Model Manager</p>
                    <p className="text-[10px] text-on-surface-variant">Download &amp; switch Gemma models</p>
                  </div>
                  {!isParent && (
                    <span className="ml-auto material-symbols-outlined text-[14px] text-outline">lock</span>
                  )}
                </button>

                {/* Agent Fleet — parent only */}
                <button
                  onClick={() => { navigate('/agents'); setDropdown(false) }}
                  disabled={!isParent}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${
                    isParent
                      ? 'text-on-surface hover:bg-surface-container-high cursor-pointer'
                      : 'text-on-surface-variant opacity-40 cursor-not-allowed'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] text-secondary">psychology</span>
                  <div>
                    <p className="font-semibold leading-tight">Agent Fleet</p>
                    <p className="text-[10px] text-on-surface-variant">Run and monitor AI agents</p>
                  </div>
                  {!isParent && (
                    <span className="ml-auto material-symbols-outlined text-[14px] text-outline">lock</span>
                  )}
                </button>

                <div className="h-px bg-outline-variant/10 my-2" />

                <p className="px-4 pt-1 pb-1.5 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                  System Status
                </p>
                <div className="px-4 py-2 flex items-center gap-2 text-xs text-on-surface-variant">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
                  <span>
                    {isRestarting    ? 'llama-server switching model…' :
                     llamaOk         ? 'llama-server online' :
                     llamaOk === false ? 'llama-server offline' : 'Checking status…'}
                  </span>
                </div>

                <div className="h-px bg-outline-variant/10 my-2" />

                {/* Manage profiles — parent only */}
                {isParent && (
                  <button
                    onClick={() => { setShowManage(true); setDropdown(false) }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-high transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-[18px] text-tertiary">manage_accounts</span>
                    <div>
                      <p className="font-semibold leading-tight">Manage Profiles</p>
                      <p className="text-[10px] text-on-surface-variant">Add, edit, or remove profiles</p>
                    </div>
                  </button>
                )}

                {/* Switch profile */}
                <button
                  onClick={() => { logout(); setDropdown(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-high transition-colors text-left"
                >
                  <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                  <span className="font-semibold">Switch Profile</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>

    {showManage && <ManageProfilesModal onClose={() => setShowManage(false)} />}
  </>
  )
}
