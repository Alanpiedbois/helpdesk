import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useCreateTicket } from '../api/hooks'
import type { TicketPriority } from '../api/types'
import { priorityLabels } from '../labels'
import { Button, ErrorMessage, Field, Input, Textarea } from '../components/ui'

export function NewTicketPage() {
  const create = useCreateTicket()
  const navigate = useNavigate()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM')

  return (
    <form
      className="mx-auto max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-6"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate({ subject, body, priority }, { onSuccess: (ticket) => navigate(`/tickets/${ticket.id}`) })
      }}
    >
      <h1 className="text-xl font-bold">Nouveau ticket</h1>
      <Field label="Sujet">
        <Input required minLength={3} maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Décrivez votre problème">
        <Textarea required rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Field label="Priorité">
        <select
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          value={priority}
          onChange={(e) => setPriority(e.target.value as TicketPriority)}
        >
          {Object.entries(priorityLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <ErrorMessage error={create.error} />
      <Button type="submit" disabled={create.isPending}>
        Envoyer
      </Button>
    </form>
  )
}
