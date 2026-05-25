import { useEffect, useRef } from 'react'

export function useWebSocket(channel: string, onMessage: (payload: unknown) => void) {
    const ws = useRef<WebSocket | null>(null)

    useEffect(() => {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const socket = new WebSocket(`${proto}://${window.location.host}/ws`)
        ws.current = socket

        socket.onopen = () => socket.send(JSON.stringify({ type: 'subscribe', channel }))
        socket.onmessage = e => {
            try {
                const msg = JSON.parse(e.data)
                if (msg.channel === channel) onMessage(msg.payload)
            } catch {
                // ignore parse errors
            }
        }
        return () => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'unsubscribe', channel }))
                socket.close()
            }
        }
    }, [channel])
}
