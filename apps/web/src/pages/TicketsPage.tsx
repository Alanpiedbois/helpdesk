import { Link, useSearchParams } from 'react-router'
import { useMe, useTickets, type TicketFilters } from '../api/hooks'
import { isStaff, type TicketStatus } from '../api/types'
import { PriorityLabel, StatusBadge } from '../components/badges'
import { statusLabels } from '../labels'
import { ErrorMessage } from '../components/ui'

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

export function TicketsPage() {
  const { data: me } = useMe()
  const staff = me ? isStaff(me) : false

  // Filters live in the URL: shareable links, and the back button restores them.
  const [params, setParams] = useSearchParams()
  const filters: TicketFilters = {
    status: (params.get('status') as TicketStatus | null) ?? undefined,
    assigned: (params.get('assigned') as 'me' | 'none' | null) ?? undefined,
    page: Number(params.get('page') ?? 1),
  }
  const { data, error, isPending, isPlaceholderData } = useTickets(filters)

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page') // a new filter starts back at page 1
    setParams(next)
  }
  const goToPage = (page: number) => {
    const next = new URLSearchParams(params)
    next.set('page', String(page))
    setParams(next)
  }
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{staff ? 'File des tickets' : 'Mes tickets'}</h1>
        {!staff && (
          <Link to="/tickets/new" className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Nouveau ticket
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <select
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
          value={filters.status ?? ''}
          onChange={(e) => setFilter('status', e.target.value)}
        >
          <option value="">Tous les statuts</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {staff && (
          <select
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
            value={filters.assigned ?? ''}
            onChange={(e) => setFilter('assigned', e.target.value)}
          >
            <option value="">Tous les tickets</option>
            <option value="me">Assignés à moi</option>
            <option value="none">Non assignés</option>
          </select>
        )}
      </div>

      <ErrorMessage error={error} />

      <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white ${isPlaceholderData ? 'opacity-60' : ''}`}>
        {isPending ? (
          <p className="p-6 text-sm text-slate-500">Chargement…</p>
        ) : data?.items.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Aucun ticket.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data?.items.map((ticket) => (
              <li key={ticket.id}>
                <Link to={`/tickets/${ticket.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50">
                  <span className="min-w-0 flex-1 truncate font-medium">{ticket.subject}</span>
                  {ticket.slaBreachedAt && !['RESOLVED', 'CLOSED'].includes(ticket.status) && (
                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
                      ⏱ SLA dépassé
                    </span>
                  )}
                  <PriorityLabel priority={ticket.priority} />
                  <StatusBadge status={ticket.status} />
                  <span className="w-full text-xs text-slate-500 sm:w-auto">
                    {staff && <>{ticket.author.name} · </>}
                    {ticket.assignee ? `Assigné à ${ticket.assignee.name}` : 'Non assigné'} ·{' '}
                    {dateFormat.format(new Date(ticket.updatedAt))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data && lastPage > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button className="rounded-md border px-2 py-1 disabled:opacity-40" disabled={filters.page <= 1} onClick={() => goToPage(filters.page - 1)}>
            Précédent
          </button>
          <span>
            Page {filters.page} / {lastPage}
          </span>
          <button className="rounded-md border px-2 py-1 disabled:opacity-40" disabled={filters.page >= lastPage} onClick={() => goToPage(filters.page + 1)}>
            Suivant
          </button>
        </div>
      )}
    </div>
  )
}
