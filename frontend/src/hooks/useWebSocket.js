import { useEffect, useRef } from 'react'

export function useWebSocket(onMessage) {
  const onMsgRef = useRef(onMessage)
  onMsgRef.current = onMessage

  useEffect(() => {
    let unmounted = false
    const url = `${import.meta.env.VITE_WS_URL || 'ws://localhost:8000'}/ws`
    let socket = null

    const connect = () => {
      if (unmounted) return
      socket = new WebSocket(url)

      socket.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data)
          onMsgRef.current?.(payload)
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
      socket?.close()
    }
  }, []) // stable — onMessage changes don't re-open the socket
}
