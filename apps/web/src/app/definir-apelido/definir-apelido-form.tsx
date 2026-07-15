'use client'

import { useActionState } from 'react'
import { AtSign } from 'lucide-react'
import { SubmitButton } from '@torcida/ui'
import { AuthRedirectEffect } from '@/components/auth-redirect-effect'
import { NicknameField } from '@/components/nickname-field'
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

      <NicknameField
        id="nickname"
        defaultValue={nicknameAtual ?? sugestao}
        nicknameAtual={nicknameAtual}
        label={
          <>
            Seu @ <span className="text-red-500">*</span>
          </>
        }
        helperText="Único na plataforma · letras, números e _ · 3 a 20 caracteres. Aparece abaixo do seu nome no feed."
        errors={state.errors?.nickname}
        autoFocus
      />

      <SubmitButton
        label={nicknameAtual ? 'Salvar e continuar' : 'Escolher apelido'}
        icon={<AtSign className="h-4 w-4" />}
      />
    </form>
  )
}
