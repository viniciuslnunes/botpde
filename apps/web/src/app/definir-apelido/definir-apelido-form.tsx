'use client'

import { useActionState } from 'react'
import { AtSign } from 'lucide-react'
import { FieldError, Input, SubmitButton } from '@torcida/ui'
import { AuthRedirectEffect } from '@/components/auth-redirect-effect'
import { definirApelido, type DefinirApelidoState } from './actions'

export function DefinirApelidoForm({
  sugestao,
  nicknameAtual,
}: {
  sugestao: string
  nicknameAtual: string | null
}) {
  const [state, action] = useActionState<DefinirApelidoState, FormData>(definirApelido, {})

  return (
    <form action={action} className="space-y-5">
      <AuthRedirectEffect redirectTo={state.redirectTo} />
      {state.message && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      <div>
        <label
          htmlFor="nickname"
          className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]"
        >
          Seu @ <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[rgb(var(--foreground-muted))]">@</span>
          <Input
            id="nickname"
            name="nickname"
            type="text"
            defaultValue={nicknameAtual ?? sugestao}
            placeholder="seu_apelido"
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
            pattern="[a-zA-Z0-9_]*"
            required
            autoFocus
            className="flex-1"
          />
        </div>
        <p className="mt-1.5 text-xs text-[rgb(var(--foreground-muted))]">
          Único na plataforma · letras, números e _ · 3 a 20 caracteres. Aparece abaixo do seu nome
          no feed.
        </p>
        <FieldError errors={state.errors?.nickname} />
      </div>

      <SubmitButton
        label={nicknameAtual ? 'Salvar e continuar' : 'Escolher apelido'}
        icon={<AtSign className="h-4 w-4" />}
      />
    </form>
  )
}
