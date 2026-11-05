import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useLogin, useMe } from '../api/hooks'
import { Button, ErrorMessage, Field, Input } from '../components/ui'

// One-click demo accounts (created by `npx prisma db seed`), so a recruiter
// can try every role without signing up.
const demoAccounts = [
  { label: 'Client', email: 'client.nina@demo.helpdesk' },
  { label: 'Agent', email: 'agent.lea@demo.helpdesk' },
  { label: 'Admin', email: 'admin@demo.helpdesk' },
]

export function LoginPage() {
  const { data: me } = useMe()
  const login = useLogin()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (me) return <Navigate to="/tickets" replace />

  const submit = (credentials: { email: string; password: string }) =>
    login.mutate(credentials, { onSuccess: () => navigate('/tickets') })

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center text-2xl font-bold tracking-tight">Helpdesk</h1>

        <form
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault()
            submit({ email, password })
          }}
        >
          <Field label="E-mail">
            <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Mot de passe">
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <ErrorMessage error={login.error} />
          <Button type="submit" className="w-full" disabled={login.isPending}>
            Se connecter
          </Button>
          <p className="text-center text-sm text-slate-600">
            Pas de compte ? <Link className="text-blue-600 hover:underline" to="/register">Créer un compte</Link>
          </p>
        </form>

        <div className="rounded-xl border border-dashed border-slate-300 p-4">
          <p className="mb-3 text-center text-sm text-slate-600">Démo : se connecter en un clic</p>
          <div className="grid grid-cols-3 gap-2">
            {demoAccounts.map((account) => (
              <button
                key={account.email}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm hover:bg-slate-50"
                disabled={login.isPending}
                onClick={() => submit({ email: account.email, password: 'demo-password' })}
              >
                {account.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
