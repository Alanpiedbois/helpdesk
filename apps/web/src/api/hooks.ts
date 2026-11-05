import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './client'
import type { DashboardStats, Page, Ticket, TicketPriority, TicketStatus, TicketSummary, User } from './types'

// TanStack Query owns all server data: caching, loading/error states, refetching.
// Query keys are the cache addresses; mutations invalidate the keys they make stale.
export const keys = {
  me: ['me'] as const,
  tickets: ['tickets'] as const,
  ticketList: (filters: TicketFilters) => ['tickets', 'list', filters] as const,
  ticket: (id: string) => ['tickets', 'detail', id] as const,
  staff: ['staff'] as const,
  stats: ['stats'] as const,
}

/** Current user, or null when logged out (401 is an answer here, not an error). */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api<User>('/auth/me')
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: Infinity, // only changes on login/logout, which update the cache themselves
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api<User>('/auth/login', { method: 'POST', body }),
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  })
}

export function useRegister() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; name: string; password: string }) =>
      api<User>('/auth/register', { method: 'POST', body }),
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.clear() // drop every cached ticket of the previous user
      qc.setQueryData(keys.me, null)
    },
  })
}

export interface TicketFilters {
  status?: TicketStatus
  assigned?: 'me' | 'none'
  page: number
}

export function useTickets(filters: TicketFilters) {
  const params = new URLSearchParams({ page: String(filters.page), pageSize: '20' })
  if (filters.status) params.set('status', filters.status)
  if (filters.assigned) params.set('assigned', filters.assigned)
  return useQuery({
    queryKey: keys.ticketList(filters),
    queryFn: () => api<Page<TicketSummary>>(`/tickets?${params}`),
    placeholderData: (previous) => previous, // keep the old page on screen while the next loads
  })
}

export function useTicket(id: string) {
  return useQuery({ queryKey: keys.ticket(id), queryFn: () => api<Ticket>(`/tickets/${id}`) })
}

export function useStaff(enabled: boolean) {
  return useQuery({
    queryKey: keys.staff,
    queryFn: () => api<{ id: string; name: string }[]>('/users/staff'),
    enabled,
  })
}

/** After any change to a ticket: put the fresh ticket in the cache, mark lists as stale. */
function useTicketMutation<V>(fn: (vars: V) => Promise<Ticket>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (ticket) => {
      qc.setQueryData(keys.ticket(ticket.id), ticket)
      void qc.invalidateQueries({ queryKey: ['tickets', 'list'] })
    },
  })
}

export function useCreateTicket() {
  return useTicketMutation((body: { subject: string; body: string; priority?: TicketPriority }) =>
    api<Ticket>('/tickets', { method: 'POST', body }),
  )
}

export function useReply(ticketId: string) {
  return useTicketMutation((body: { body: string; internal: boolean }) =>
    api<Ticket>(`/tickets/${ticketId}/messages`, { method: 'POST', body }),
  )
}

export function useUpdateTicket(ticketId: string) {
  return useTicketMutation(
    (body: { status?: TicketStatus; priority?: TicketPriority; assigneeId?: string | null }) =>
      api<Ticket>(`/tickets/${ticketId}`, { method: 'PATCH', body }),
  )
}

export function useStats() {
  return useQuery({ queryKey: keys.stats, queryFn: () => api<DashboardStats>('/stats') })
}
