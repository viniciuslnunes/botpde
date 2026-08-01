'use client'

import { useActionState, useState } from 'react'
import { entrarComSenha, type LoginSenhaState } from './actions'
import { AuthRedirectEffect } from '@/components/auth-redirect-effect'
import { Mail, Lock, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { Input, SubmitButton, hexToRgb } from '@torcida/ui'
import Link from 'next/link'

export function EntrarSenhaForm({
  corPrimaria = '#7c3aed',
  callbackUrl,
}: {
  corPrimaria?: string
  /** Destino a retomar depois do login (ex.: convite de unidade). */
  callbackUrl?: string
}) {
  const [state, action] = useActionState<LoginSenhaState, FormData>(entrarComSenha, {})
  const [mostrarSenha, setMostrarSenha] = useState(false)

  return (
    <div className="space-y-3">
      <form action={action} className="space-y-3">
        <AuthRedirectEffect redirectTo={state.redirectTo} />
        {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
        {state.message && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {state.message}
          </div>
        )}

        <div>
          <label htmlFor="email-senha" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
            <Mail className="h-3.5 w-3.5" />
            E-mail ou apelido
          </label>
          <Input
            id="email-senha"
            name="email"
            type="text"
            autoComplete="username"
            placeholder="seu@email.com ou @apelido"
            required
          />
        </div>

        <div>
          <label htmlFor="senha" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
            <Lock className="h-3.5 w-3.5" />
            Senha
          </label>
          <div className="relative">
            <Input
              id="senha"
              name="senha"
              type={mostrarSenha ? 'text' : 'password'}
              placeholder="Sua senha"
              required
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setMostrarSenha((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
              aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div style={{ '--color-primary': hexToRgb(corPrimaria) } as React.CSSProperties}>
          <SubmitButton
            label="Entrar"
            pendingLabel="Entrando..."
            icon={<ChevronRight className="h-4 w-4" />}
            iconPosition="trailing"
            fullWidth
          />
        </div>
      </form>

      <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">
        Não tem conta?{' '}
        <Link
          href={
            callbackUrl
              ? `/entrar/criar-conta?callbackUrl=${encodeURIComponent(callbackUrl)}`
              : '/entrar/criar-conta'
          }
          className="font-medium text-[rgb(var(--foreground))] underline underline-offset-2 hover:no-underline"
        >
          Criar conta com e-mail
        </Link>
      </p>
    </div>
  )
}
