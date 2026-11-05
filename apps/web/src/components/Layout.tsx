import { Link, Navigate, NavLink, Outlet, useNavigate } from 'react-router'
import { useLogout, useMe } from '../api/hooks'
import { useRealtime } from '../api/realtime'
import { isStaff } from '../api/types'

const roleLabels = { CLIENT: 'Client', AGENT: 'Agent', ADMIN: 'Admin' } as const

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2 py-1 ${isActive ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`

/** Shell of every logged-in page. Also the auth gate: no session means back to /login. */
export function Layout() {
  const { data: me, isPending } = useMe()
  const logout = useLogout()
  const navigate = useNavigate()
  const { connected, toasts } = useRealtime(me)

  if (isPending) return <p className="p-8 text-slate-500">Chargement…</p>
  if (!me) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link to="/tickets" className="text-lg font-bold tracking-tight">
              Helpdesk
            </Link>
            <nav className="flex gap-1 text-sm">
              <NavLink to="/tickets" end className={navClass}>
                Tickets
              </NavLink>
              {isStaff(me) && (
                <NavLink to="/dashboard" className={navClass}>
                  Tableau de bord
                </NavLink>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span
              className="flex items-center gap-1.5 text-xs text-slate-500"
              title={connected ? 'Mises à jour en temps réel actives' : 'Temps réel déconnecté'}
            >
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              {connected ? 'En direct' : 'Hors ligne'}
            </span>
            <span className="text-slate-600">
              {me.name} <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{roleLabels[me.role]}</span>
            </span>
            <button
              className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100"
              onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>

      {/* aria-live: screen readers announce new notifications */}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-10 space-y-2">
        {toasts.map((t) => (
          <Link
            key={t.id}
            to={`/tickets/${t.ticketId}`}
            className="block rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg hover:bg-slate-800"
          >
            {t.text} →
          </Link>
        ))}
      </div>
    </div>
  )
}
