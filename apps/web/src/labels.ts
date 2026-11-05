import type { TicketPriority, TicketStatus } from './api/types'

export const statusLabels: Record<TicketStatus, string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  WAITING_CUSTOMER: 'En attente client',
  RESOLVED: 'Résolu',
  CLOSED: 'Fermé',
}

export const priorityLabels: Record<TicketPriority, string> = {
  LOW: 'Basse',
  MEDIUM: 'Normale',
  HIGH: 'Haute',
  URGENT: 'Urgente',
}

export const categoryLabels: Record<string, string> = {
  billing: 'Facturation',
  bug: 'Bug',
  account: 'Compte',
  feature_request: 'Suggestion',
  how_to: 'Question',
  other: 'Autre',
}
