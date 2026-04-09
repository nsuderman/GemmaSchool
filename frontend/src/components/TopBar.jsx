import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function TopBar() {
  const [llamaOk, setLlamaOk] = useState(null)  // null = checking, true/false = result

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

  const statusDot =
    llamaOk === null ? 'bg-outline animate-pulse' :
    llamaOk          ? 'bg-secondary animate-pulse' :
                       'bg-error'

  const statusText =
    llamaOk === null ? 'Checking…' :
    llamaOk          ? 'llama.cpp' :
                       'Offline'

  return (
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
      <div className="flex items-center gap-4">
        {/* llama.cpp status indicator */}
        <div
          className={`flex items-center gap-2 text-xs bg-surface-container rounded-full px-3 py-1.5 ${
            llamaOk === false ? 'text-error' : 'text-on-surface-variant'
          }`}
          title={llamaOk === false ? 'llama-server unreachable' : 'llama.cpp server'}
        >
          <span className={`w-2 h-2 rounded-full ${statusDot}`} />
          {statusText}
        </div>

        <button className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors relative">
          <span className="material-symbols-outlined text-[22px]">notifications</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full" />
        </button>

        <button className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-full transition-colors">
          <span className="material-symbols-outlined text-[22px]">auto_awesome</span>
        </button>

        <button className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors">
          <span className="material-symbols-outlined text-[22px]">account_circle</span>
        </button>
      </div>
    </header>
  )
}
