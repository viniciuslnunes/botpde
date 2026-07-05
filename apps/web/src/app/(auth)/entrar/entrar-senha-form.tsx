'use client'

import { useActionState } from 'react'
import { entrarComSenha, type LoginSenhaState } from './actions'
import { Mail, Lock, ChevronRight } from 'lucide-react'
import { Input, SubmitButton } from '@torcida/ui'
import Link from 'next/link'

export function EntrarSenhaForm({ corPrimaria = '#7c3aed' }: { corPrimaria?: string }) {
  const [state, action] = useActionState<LoginSenhaState, FormData>(entrarComSenha, {})

  return (
    <div className="space-y-3">
      <form action={action} className="space-y-3">
        {state.message && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {state.message}
          </div>
        )}

        <div>
          <label htmlFor="email-senha" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
            <Mail className="h-3.5 w-3.5" />
            E-mail
          </label>
          <Input id="email-senha" name="email" type="email" placeholder="seu@email.com" required />
        </div>

        <div>
          <label htmlFor="senha" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]">
            <Lock className="h-3.5 w-3.5" />
            Senha
          </label>
          <Input id="senha" name="senha" type="password" placeholder="Sua senha" required />
        </div>

        <div style={{ '--color-primary': corPrimaria } as React.CSSProperties}>
          <SubmitButton
            label="Entrar com e-mail"
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
          href="/entrar/criar-conta"
          className="font-medium text-[rgb(var(--foreground))] underline underline-offset-2 hover:no-underline"
        >
          Criar conta com e-mail
        </Link>
      </p>
    </div>
  )
}
