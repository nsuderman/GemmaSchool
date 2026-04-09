import { useEffect, useRef, useCallback } from 'react'

export function useWebSocket(onMessage) {
  const ws = useRef(null)
  const url = `${import.meta.env.VITE_WS_URL || 'ws://localhost:8000'}/ws`

  const connect = useCallback(() => {
    ws.current = new WebSocket(url)

    ws.current.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data)
        onMessage?.(payload)
      } catch {
        // ignore malformed messages
      }
    }

    ws.current.onclose = () => {
      // Reconnect after 3s on unexpected close
      setTimeout(connect, 3000)
    }
  }, [url, onMessage])

  useEffect(() => {
    connect()
    return () => ws.current?.close()
  }, [connect])
}
