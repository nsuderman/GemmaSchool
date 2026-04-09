import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { useProfile, PROFILE_COLORS, getInitials } from '../contexts/ProfileContext'

const PARENT_NAV = [
  { to: '/',         icon: 'home_app_logo', label: 'Command Center' },
  { to: '/quest-load', icon: 'upload_file', label: 'Quest Load', group: 'quests' },
  { to: '/quests',   icon: 'map',           label: 'Quest Board', group: 'quests' },
  { to: '/vault',    icon: 'folder_open',   label: 'Vault' },
  { to: '/agents',   icon: 'psychology',    label: 'Agent Fleet' },
  { to: '/settings/model-manager', icon: 'memory',   label: 'Model Manager', group: 'settings' },
  { to: '/settings/calendar',      icon: 'calendar_month', label: 'Calendar', group: 'settings' },
]

const STUDENT_NAV = [
  { to: '/',       icon: 'home_app_logo', label: 'Command Center' },
  { to: '/quests', icon: 'map',           label: 'Quest Board' },
  { to: '/vault',  icon: 'folder_open',   label: 'Vault' },
]

export default function Sidebar() {
  const { activeProfile, logout } = useProfile()
  const isParent  = activeProfile?.role === 'parent'
  const navItems  = isParent ? PARENT_NAV : STUDENT_NAV
  const colors    = PROFILE_COLORS[activeProfile?.color] || PROFILE_COLORS.primary
  const [questsOpen, setQuestsOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(true)

  const nonQuest = navItems.filter((n) => !n.group)
  const questChildren = navItems.filter((n) => n.group === 'quests')
  const settingsChildren = navItems.filter((n) => n.group === 'settings')

  return (
    <aside className="fixed inset-y-0 left-0 flex flex-col h-full w-64 bg-surface-container-low z-50">
      {/* Wordmark */}
      <div className="p-8 pb-6">
        <h1 className="text-xl font-headline font-bold bg-gradient-to-br from-primary to-primary-fixed-dim bg-clip-text text-transparent leading-tight">
          GemmaSchool
        </h1>
        <p className="text-[10px] uppercase tracking-widest text-outline mt-1 font-semibold">
          Local Learning
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 space-y-1">
        {nonQuest.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'text-primary font-bold bg-primary/8 border-r-4 border-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:translate-x-0.5'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
            <span className="font-headline tracking-tight">{label}</span>
          </NavLink>
        ))}

        {isParent && questChildren.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => setQuestsOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <span className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px]">map</span>
                <span className="font-headline text-sm font-semibold tracking-tight">Quests</span>
              </span>
              <span className="material-symbols-outlined text-[16px]">
                {questsOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {questsOpen && (
              <div className="mt-1 ml-5 border-l border-outline-variant/20 pl-2 space-y-1">
                {questChildren.map(({ to, icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
                        isActive
                          ? 'text-primary font-bold bg-primary/8 border-r-4 border-primary'
                          : 'text-on-surface-variant font-semibold hover:text-on-surface hover:bg-surface-container-high'
                      }`
                    }
                  >
                    <span className="material-symbols-outlined text-[16px]">{icon}</span>
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}

        {isParent && settingsChildren.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => setSettingsOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <span className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px]">settings</span>
                <span className="font-headline text-sm font-semibold tracking-tight">Settings</span>
              </span>
              <span className="material-symbols-outlined text-[16px]">
                {settingsOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {settingsOpen && (
              <div className="mt-1 ml-5 border-l border-outline-variant/20 pl-2 space-y-1">
                {settingsChildren.map(({ to, icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
                        isActive
                          ? 'text-primary font-bold bg-primary/8 border-r-4 border-primary'
                          : 'text-on-surface-variant font-semibold hover:text-on-surface hover:bg-surface-container-high'
                      }`
                    }
                  >
                    <span className="material-symbols-outlined text-[16px]">{icon}</span>
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Bottom: Report Issue + profile */}
      <div className="p-4 space-y-3">
        <a
          href="https://github.com/nsuderman/GemmaSchool/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3.5 px-4 rounded-xl font-bold font-headline text-sm flex items-center justify-center gap-2 text-on-primary bg-primary shadow-primary-glow hover:brightness-105 hover:scale-[1.02] active:scale-95 transition-transform"
          title="Report an issue on GitHub"
        >
          <span className="material-symbols-outlined text-[18px]">bug_report</span>
          Report Bug
        </a>

        {/* Active profile chip + switch */}
        <div className="flex items-center gap-3 p-3 bg-surface-container rounded-xl">
          <div className={`w-9 h-9 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center font-bold text-sm font-headline flex-shrink-0`}>
            {activeProfile ? getInitials(activeProfile.name) : '?'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-bold truncate text-on-surface">{activeProfile?.name}</p>
            <p className="text-[10px] text-on-surface-variant capitalize">{activeProfile?.role}</p>
          </div>
          <button
            onClick={logout}
            title="Switch profile"
            className="text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
