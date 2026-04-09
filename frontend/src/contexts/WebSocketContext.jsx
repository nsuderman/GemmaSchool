import { createContext, useContext, useState, useRef, useEffect } from 'react'

const WSContext = createContext({ events: [] })

/**
 * Single global WebSocket connection shared across the entire app.
 * All components read from the same event stream — no duplicate sockets.
 */
export function WebSocketProvider({ children }) {
  const [events, setEvents] = useState([])

  useEffect(() => {
    let unmounted = false
    const url = `${import.meta.env.VITE_WS_URL || 'ws://localhost:8000'}/ws`

    const connect = () => {
      if (unmounted) return
      const socket = new WebSocket(url)

      socket.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data)
          setEvents((prev) => [{ ...payload, ts: Date.now() }, ...prev].slice(0, 200))
        } catch {
          // ignore malformed messages
        }
      }

      socket.onclose = () => {
        if (!unmounted) setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      unmounted = true
    }
  }, [])

  return <WSContext.Provider value={{ events }}>{children}</WSContext.Provider>
}

/** All events, newest first. */
export function useWSEvents() {
  return useContext(WSContext).events
}

/** Events filtered by event name prefix, e.g. "agent." or "model." */
export function useWSEventsByPrefix(prefix) {
  const events = useContext(WSContext).events
  return prefix ? events.filter((e) => e.event?.startsWith(prefix)) : events
}

/** The single most recent event matching a prefix, or null. */
export function useWSLatest(prefix) {
  const events = useWSEventsByPrefix(prefix)
  return events[0] ?? null
}
