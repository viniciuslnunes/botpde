'use client'

import { useActionState } from 'react'
import { criarContaComSenha, type ContaState } from '../actions'
import { UserCircle2, Mail, Lock, ChevronRight } from 'lucide-react'
import { FieldError, Input, SubmitButton } from '@torcida/ui'

export function CriarContaForm({ corPrimaria = '#7c3aed' }: { corPrimaria?: string }) {
  const [state, action] = useActionState<ContaState, FormData>(criarContaComSenha, {})

  return (
    <form action={action} className="space-y-4">
      {state.message && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      <div>
        <label htmlFor="nome" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          <span className="flex items-center gap-1.5">
            <UserCircle2 className="h-3.5 w-3.5" />
            Nome completo
          </span>
        </label>
        <Input id="nome" name="nome" type="text" placeholder="Seu nome completo" required />
        <FieldError errors={state.errors?.nome} />
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          <span className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            E-mail
          </span>
        </label>
        <Input id="email" name="email" type="email" placeholder="seu@email.com" required />
        <FieldError errors={state.errors?.email} />
      </div>

      <div>
        <label htmlFor="senha" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            Senha
          </span>
        </label>
        <Input id="senha" name="senha" type="password" placeholder="Mínimo 8 caracteres" minLength={8} required />
        <FieldError errors={state.errors?.senha} />
      </div>

      <div>
        <label htmlFor="confirmarSenha" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Confirmar senha
        </label>
        <Input id="confirmarSenha" name="confirmarSenha" type="password" placeholder="Repita a senha" minLength={8} required />
        <FieldError errors={state.errors?.confirmarSenha} />
      </div>

      <div className="pt-2" style={{ '--color-primary': corPrimaria } as React.CSSProperties}>
        <SubmitButton
          label="Criar conta"
          pendingLabel="Criando..."
          icon={<ChevronRight className="h-4 w-4" />}
          iconPosition="trailing"
          fullWidth
        />
      </div>
    </form>
  )
}
