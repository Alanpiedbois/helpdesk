import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMe, useReply, useStaff, useTicket, useUpdateTicket } from '../api/hooks'
import { isStaff, type Ticket, type TicketPriority, type TicketStatus } from '../api/types'
import { PriorityLabel, StatusBadge } from '../components/badges'
import { priorityLabels, statusLabels } from '../labels'
import { Button, ErrorMessage, Textarea } from '../components/ui'

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

export function TicketPage() {
  const { id = '' } = useParams()
  const { data: me } = useMe()
  const { data: ticket, error, isPending } = useTicket(id)
  const staff = me ? isStaff(me) : false

  if (isPending) return <p className="text-slate-500">Chargement…</p>
  if (error || !ticket) return <ErrorMessage error={error ?? new Error('Ticket introuvable')} />

  return (
    <div className="space-y-4">
      <Link to="/tickets" className="text-sm text-blue-600 hover:underline">
        ← Retour
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{ticket.subject}</h1>
        <StatusBadge status={ticket.status} />
        <PriorityLabel priority={ticket.priority} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <ol className="space-y-3">
            {ticket.messages.map((m) => (
              <li
                key={m.id}
                className={`rounded-xl border p-4 ${
                  m.internal ? 'border-amber-200 bg-amber-50' : m.author.role === 'CLIENT' ? 'border-slate-200 bg-white' : 'border-blue-100 bg-blue-50/50'
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-800">{m.author.name}</span>
                  {m.author.role !== 'CLIENT' && <span>· Support</span>}
                  {m.internal && <span className="font-medium text-amber-700">· Note interne</span>}
                  <span>· {dateFormat.format(new Date(m.createdAt))}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{m.body}</p>
              </li>
            ))}
          </ol>
          {ticket.status === 'CLOSED' ? (
            <p className="text-sm text-slate-500">Ce ticket est fermé.</p>
          ) : (
            <ReplyForm ticketId={ticket.id} staff={staff} />
          )}
        </div>

        {staff && <StaffPanel ticket={ticket} />}
      </div>
    </div>
  )
}

function ReplyForm({ ticketId, staff }: { ticketId: string; staff: boolean }) {
  const reply = useReply(ticketId)
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        reply.mutate({ body, internal }, { onSuccess: () => setBody('') })
      }}
    >
      <Textarea
        required
        rows={4}
        placeholder={internal ? 'Note visible uniquement par le support…' : 'Votre réponse…'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <ErrorMessage error={reply.error} />
      <div className="flex items-center justify-between">
        {staff ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
            Note interne
          </label>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={reply.isPending}>
          {internal ? 'Ajouter la note' : 'Répondre'}
        </Button>
      </div>
    </form>
  )
}

function StaffPanel({ ticket }: { ticket: Ticket }) {
  const update = useUpdateTicket(ticket.id)
  const { data: staffList } = useStaff(true)
  const closed = ticket.status === 'CLOSED'
  const select = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:bg-slate-100'

  return (
    <aside className="h-fit space-y-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <div className="text-slate-600">
        Client : <span className="font-medium text-slate-900">{ticket.author.name}</span>
      </div>
      <label className="block space-y-1">
        <span className="font-medium">Assigné à</span>
        <select
          className={select}
          disabled={closed || update.isPending}
          value={ticket.assignee?.id ?? ''}
          onChange={(e) => update.mutate({ assigneeId: e.target.value || null })}
        >
          <option value="">Non assigné</option>
          {staffList?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="font-medium">Statut</span>
        <select
          className={select}
          disabled={closed || update.isPending}
          value={ticket.status}
          onChange={(e) => update.mutate({ status: e.target.value as TicketStatus })}
        >
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="font-medium">Priorité</span>
        <select
          className={select}
          disabled={closed || update.isPending}
          value={ticket.priority}
          onChange={(e) => update.mutate({ priority: e.target.value as TicketPriority })}
        >
          {Object.entries(priorityLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <ErrorMessage error={update.error} />
    </aside>
  )
}
