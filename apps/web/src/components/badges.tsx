import type { TicketPriority, TicketStatus } from '../api/types'
import { priorityLabels, statusLabels } from '../labels'

const statusStyles: Record<TicketStatus, string> = {
  OPEN: 'bg-blue-50 text-blue-700 ring-blue-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-800 ring-amber-200',
  WAITING_CUSTOMER: 'bg-violet-50 text-violet-700 ring-violet-200',
  RESOLVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CLOSED: 'bg-slate-100 text-slate-600 ring-slate-200',
}

const priorityStyles: Record<TicketPriority, string> = {
  LOW: 'text-slate-500',
  MEDIUM: 'text-slate-700',
  HIGH: 'text-orange-600',
  URGENT: 'text-red-600 font-semibold',
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  )
}

export function PriorityLabel({ priority }: { priority: TicketPriority }) {
  return <span className={`text-xs ${priorityStyles[priority]}`}>{priorityLabels[priority]}</span>
}
