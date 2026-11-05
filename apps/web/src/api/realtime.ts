import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { keys } from './hooks'
import type { RealtimeMessage, User } from './types'

export interface Toast {
  id: number
  text: string
  ticketId: string
}

/** Short French notice for events worth interrupting the user for; null = silent refresh. */
function toastText(m: RealtimeMessage, staff: boolean): string | null {
  switch (m.type) {
    case 'ticket.created':
      return staff ? 'Nouveau ticket' : null
    case 'message.created':
      return 'Nouveau message'
    case 'ticket.sla_breached':
      return 'SLA dépassé sur un ticket'
    default:
      return null
  }
}

/**
 * One Socket.IO connection per logged-in tab. The server only pushes "ticket X changed";
 * the client reacts by invalidating the matching TanStack Query caches, which refetch
 * through the normal REST API. So access rules stay in one place (the REST endpoints)
 * and the WebSocket never carries data the user could not already fetch.
 */
export function useRealtime(me: User | null | undefined) {
  const qc = useQueryClient()
  const [connected, setConnected] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    if (!me) return
    // Same origin as the page (Vite proxies /socket.io), so the session cookie is sent.
    const socket = io({ path: '/socket.io', transports: ['websocket'] })
    const staff = me.role !== 'CLIENT'

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('ticket.event', (m: RealtimeMessage) => {
      void qc.invalidateQueries({ queryKey: ['tickets', 'list'] })
      void qc.invalidateQueries({ queryKey: keys.ticket(m.ticketId) })
      if (staff) void qc.invalidateQueries({ queryKey: keys.stats })

      const text = m.actorId === me.id ? null : toastText(m, staff) // no toast for your own actions
      if (text) {
        const toast = { id: Date.now() + Math.random(), text, ticketId: m.ticketId }
        setToasts((current) => [...current.slice(-2), toast]) // keep at most 3
        setTimeout(() => setToasts((current) => current.filter((t) => t.id !== toast.id)), 5000)
      }
    })

    return () => {
      socket.disconnect() // logout or user change: close this connection
    }
  }, [me, qc])

  return { connected, toasts }
}
