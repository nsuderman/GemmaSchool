import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/',        icon: 'home_app_logo',  label: 'Command Center' },
  { to: '/quests',  icon: 'map',            label: 'Quest Board' },
  { to: '/vault',   icon: 'folder_open',    label: 'Vault' },
  { to: '/agents',  icon: 'psychology',     label: 'Agent Fleet' },
  { to: '/settings',icon: 'settings',       label: 'Settings' },
]

export default function Sidebar() {
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

      {/* Bottom: AI shimmer CTA + profile */}
      <div className="p-4 space-y-3">
        <button className="w-full py-3.5 px-4 ai-shimmer text-on-primary rounded-xl font-bold font-headline text-sm flex items-center justify-center gap-2 shadow-primary-glow hover:scale-[1.02] active:scale-95 transition-transform">
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          New Quest
        </button>

        <div className="flex items-center gap-3 p-3 bg-surface-container rounded-xl">
          <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold text-sm font-headline flex-shrink-0">
            P
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-bold truncate text-on-surface">Parent Admin</p>
            <p className="text-[10px] text-on-surface-variant">GemmaSchool Home</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
