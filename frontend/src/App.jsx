import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Dashboard from './pages/Dashboard'
import QuestBoard from './pages/QuestBoard'
import KnowledgeGrove from './pages/KnowledgeGrove'
import SetupWizard from './pages/SetupWizard'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function App() {
  const [setupState, setSetupState] = useState('loading') // 'loading' | 'needed' | 'done'

  useEffect(() => {
    fetch(`${API}/setup/status`)
      .then((r) => r.json())
      .then((data) => setSetupState(data.needs_setup ? 'needed' : 'done'))
      .catch(() => setSetupState('done')) // if backend unreachable, show main app
  }, [])

  // Loading splash
  if (setupState === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto"
               style={{ borderWidth: '3px' }} />
          <p className="text-on-surface-variant text-sm">Starting GemmaSchool…</p>
        </div>
      </div>
    )
  }

  // First-run setup wizard
  if (setupState === 'needed') {
    return <SetupWizard onComplete={() => setSetupState('done')} />
  }

  // Main app
  return (
    <div className="bg-background text-on-background min-h-screen">
      <Sidebar />
      <TopBar />
      <main className="ml-64 pt-20 pb-12 px-8 min-h-screen">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/quests" element={<QuestBoard />} />
          <Route path="/vault"  element={<KnowledgeGrove />} />
        </Routes>
      </main>

      {/* Floating AI Assistant */}
      <div className="fixed bottom-8 right-8 z-50">
        <button className="w-16 h-16 glass-panel ghost-border rounded-full editorial-shadow flex items-center justify-center hover:scale-110 active:scale-95 transition-all">
          <span className="material-symbols-outlined text-primary text-3xl material-symbols-filled">
            support_agent
          </span>
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-primary" />
          </span>
        </button>
      </div>
    </div>
  )
}
