import { useState } from 'react'
import { useStats } from '../api/hooks'
import type { DashboardStats, TicketStatus } from '../api/types'
import { ErrorMessage } from '../components/ui'
import { statusLabels } from '../labels'

const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m}` : `${h} h`
}

/** Headline numbers: a single value reads faster as a number than as a chart. */
function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-600">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

/** Tickets per status: comparing magnitudes across categories -> horizontal bars, one hue. */
function StatusBars({ byStatus }: { byStatus: DashboardStats['byStatus'] }) {
  const entries = Object.entries(byStatus) as [TicketStatus, number][]
  const max = Math.max(1, ...entries.map(([, n]) => n))
  return (
    <ul className="space-y-2">
      {entries.map(([status, count]) => (
        <li key={status} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-3 text-sm">
          <span className="text-slate-600">{statusLabels[status]}</span>
          <span className="h-3 rounded-r bg-slate-100">
            {/* the bar grows from the baseline (left); only the value end is rounded */}
            <span className="block h-3 rounded-r bg-blue-600" style={{ width: `${(count / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums text-slate-900">{count}</span>
        </li>
      ))}
    </ul>
  )
}

/** Tickets created per day: change over time for one series -> vertical bars + hover tooltip. */
function DailyChart({ data }: { data: DashboardStats['createdPerDay'] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.count))
  const point = hovered === null ? null : data[hovered]

  return (
    <div>
      <div className="mb-2 h-5 text-sm text-slate-600" aria-live="polite">
        {point
          ? `${dayFormat.format(new Date(point.day))} : ${point.count} ticket${point.count > 1 ? 's' : ''}`
          : `Max : ${max} par jour`}
      </div>
      {/* gap-0.5 = 2px surface gap between adjacent bars */}
      <div className="flex h-40 items-end gap-0.5 border-b border-slate-300" onMouseLeave={() => setHovered(null)}>
        {data.map((d, i) => (
          // The hit target is the full column height, larger than the bar itself.
          <div
            key={d.day}
            className="flex h-full flex-1 items-end"
            onMouseEnter={() => setHovered(i)}
            onFocus={() => setHovered(i)}
            tabIndex={0}
            aria-label={`${d.day} : ${d.count}`}
          >
            <div
              className={`w-full rounded-t ${hovered === i ? 'bg-blue-800' : 'bg-blue-600'}`}
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>{data[0] && dayFormat.format(new Date(data[0].day))}</span>
        <span>{data.at(-1) && dayFormat.format(new Date(data.at(-1)!.day))}</span>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { data: stats, error, isPending } = useStats()
  const [showTable, setShowTable] = useState(false)

  if (isPending) return <p className="text-slate-500">Chargement…</p>
  if (error || !stats) return <ErrorMessage error={error} />

  const open = stats.byStatus.OPEN + stats.byStatus.IN_PROGRESS + stats.byStatus.WAITING_CUSTOMER

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">Tableau de bord</h1>
        <span className="text-xs text-slate-500">
          Calculé à {new Date(stats.generatedAt).toLocaleTimeString('fr-FR')}
          {stats.cached ? ' · servi depuis le cache Redis' : ''}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Tickets actifs" value={open} />
        <StatTile label="Non assignés" value={stats.unassignedOpen} hint="parmi les tickets actifs" />
        <StatTile label="SLA dépassé" value={stats.slaBreachedOpen} hint="sans première réponse à temps" />
        <StatTile
          label="Première réponse"
          value={formatMinutes(stats.avgFirstResponseMinutes)}
          hint="délai moyen, 30 derniers jours"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-4 font-semibold">Tickets par statut</h2>
          <StatusBars byStatus={stats.byStatus} />
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Tickets créés par jour</h2>
            <button className="text-xs text-blue-600 hover:underline" onClick={() => setShowTable(!showTable)}>
              {showTable ? 'Voir le graphique' : 'Voir le tableau'}
            </button>
          </div>
          {showTable ? (
            <table className="w-full text-sm">
              <tbody>
                {stats.createdPerDay.map((d) => (
                  <tr key={d.day} className="border-b border-slate-100">
                    <td className="py-1 text-slate-600">{dayFormat.format(new Date(d.day))}</td>
                    <td className="py-1 text-right tabular-nums">{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <DailyChart data={stats.createdPerDay} />
          )}
        </section>
      </div>
    </div>
  )
}
