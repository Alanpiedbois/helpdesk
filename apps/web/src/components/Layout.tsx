import { Link, Navigate, Outlet, useNavigate } from 'react-router'
import { useLogout, useMe } from '../api/hooks'

const roleLabels = { CLIENT: 'Client', AGENT: 'Agent', ADMIN: 'Admin' } as const

/** Shell of every logged-in page. Also the auth gate: no session means back to /login. */
export function Layout() {
  const { data: me, isPending } = useMe()
  const logout = useLogout()
  const navigate = useNavigate()

  if (isPending) return <p className="p-8 text-slate-500">Chargement…</p>
  if (!me) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/tickets" className="text-lg font-bold tracking-tight">
            Helpdesk
          </Link>
          <div className="flex items-center gap-3 text-sm">
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
    </div>
  )
}
