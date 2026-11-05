// Mirrors the API responses. Kept by hand for now; a shared package or OpenAPI
// generation would remove the duplication if the API grows.

export type Role = 'CLIENT' | 'AGENT' | 'ADMIN'
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED'
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export interface User {
  id: string
  email: string
  name: string
  role: Role
}

export interface UserSummary {
  id: string
  name: string
}

export interface TicketSummary {
  id: string
  subject: string
  status: TicketStatus
  priority: TicketPriority
  category: string | null
  aiSummary: string | null
  aiSuggestedPriority: TicketPriority | null
  triagedAt: string | null
  firstResponseAt: string | null
  slaBreachedAt: string | null
  createdAt: string
  updatedAt: string
  author: UserSummary
  assignee: UserSummary | null
}

export interface Message {
  id: string
  body: string
  internal: boolean
  createdAt: string
  author: UserSummary & { role: Role }
}

export interface Ticket extends TicketSummary {
  messages: Message[]
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export const isStaff = (user: Pick<User, 'role'>) => user.role !== 'CLIENT'

export interface DashboardStats {
  byStatus: Record<TicketStatus, number>
  openByPriority: Record<TicketPriority, number>
  unassignedOpen: number
  slaBreachedOpen: number
  avgFirstResponseMinutes: number | null
  createdPerDay: { day: string; count: number }[]
  generatedAt: string
  cached: boolean
}

/** Sent by the API over the WebSocket: which ticket changed, how, and by whom. */
export interface RealtimeMessage {
  type: 'ticket.created' | 'message.created' | 'ticket.updated' | 'ticket.sla_breached' | 'ticket.triaged'
  ticketId: string
  actorId: string | null
}
