import { NavLink } from 'react-router-dom'
import { useProfile, PROFILE_COLORS, getInitials } from '../contexts/ProfileContext'

const PARENT_NAV = [
  { to: '/',         icon: 'home_app_logo', label: 'Command Center' },
  { to: '/quests',   icon: 'map',           label: 'Quest Board' },
  { to: '/vault',    icon: 'folder_open',   label: 'Vault' },
  { to: '/agents',   icon: 'psychology',    label: 'Agent Fleet' },
  { to: '/settings', icon: 'settings',      label: 'Model Manager' },
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

  return (
    <aside className="fixed inset-y-0 left-0 flex flex-col h-full w-64 bg-surface-container-low z-50">
      {/* Wordmark */}
      <div className="p-8 pb-6">
        <h1 className="text-xl font-headline font-bold bg-gradient-to-br from-primary to-primary-fixed-dim bg-clip-text text-transparent leading-tight">
          GemmaSchool
        </h1>
        <p className="text-[10px] uppercase tracking-widest text-outline mt-1 font-semibold">
          Sovereign Learning
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 space-y-1">
        {navItems.map(({ to, icon, label }) => (
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
      </nav>

      {/* Bottom: New Quest + profile */}
      <div className="p-4 space-y-3">
        <button className="w-full py-3.5 px-4 ai-shimmer text-on-primary rounded-xl font-bold font-headline text-sm flex items-center justify-center gap-2 shadow-primary-glow hover:scale-[1.02] active:scale-95 transition-transform">
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          New Quest
        </button>

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
