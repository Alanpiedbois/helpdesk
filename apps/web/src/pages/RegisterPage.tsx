import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useMe, useRegister } from '../api/hooks'
import { Button, ErrorMessage, Field, Input } from '../components/ui'

export function RegisterPage() {
  const { data: me } = useMe()
  const register = useRegister()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '' })

  if (me) return <Navigate to="/tickets" replace />

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value })

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault()
          register.mutate(form, { onSuccess: () => navigate('/tickets') })
        }}
      >
        <h1 className="text-xl font-bold">Créer un compte</h1>
        <Field label="Nom">
          <Input required minLength={2} autoComplete="name" value={form.name} onChange={set('name')} />
        </Field>
        <Field label="E-mail">
          <Input type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Mot de passe (8 caractères minimum)">
          <Input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
          />
        </Field>
        <ErrorMessage error={register.error} />
        <Button type="submit" className="w-full" disabled={register.isPending}>
          Créer mon compte
        </Button>
        <p className="text-center text-sm text-slate-600">
          Déjà inscrit ? <Link className="text-blue-600 hover:underline" to="/login">Se connecter</Link>
        </p>
      </form>
    </div>
  )
}
