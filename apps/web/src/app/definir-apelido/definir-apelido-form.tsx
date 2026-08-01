'use client'

import { useActionState, useState } from 'react'
import { AtSign } from 'lucide-react'
import { FieldError, Input, SubmitButton } from '@torcida/ui'
import { AuthRedirectEffect } from '@/components/auth-redirect-effect'
import { NicknameField } from '@/components/nickname-field'
import { definirApelido, type DefinirApelidoState } from './actions'

export function DefinirApelidoForm({
  sugestao,
  nicknameAtual,
  nomeAtual,
  emailAtual,
  pedirNome,
  pedirEmail,
  callbackUrl,
}: {
  sugestao: string
  nicknameAtual: string | null
  nomeAtual: string
  emailAtual: string
  pedirNome: boolean
  pedirEmail: boolean
  /** Destino a retomar depois (convite direto). */
  callbackUrl?: string | null
}) {
  const [state, action] = useActionState<DefinirApelidoState, FormData>(definirApelido, {})
  const [nickDisponivel, setNickDisponivel] = useState(Boolean(sugestao || nicknameAtual))
  const [nomeDraft, setNomeDraft] = useState(nomeAtual)
  const soNickname = !pedirNome && !pedirEmail

  return (
    <form
      action={action}
      className="space-y-5"
      onSubmit={(e) => {
        if (!nickDisponivel) e.preventDefault()
      }}
    >
      <AuthRedirectEffect
        redirectTo={state.redirectTo}
        message="Preparando seu onboarding..."
        description="Estamos configurando seu perfil e carregando os clubes."
      />
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      {state.message && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      {pedirNome ? (
        <div>
          <label
            htmlFor="nome"
            className="mb-1.5 block text-sm font-medium text-[rgb(var(--foreground))]"
          >
            Seu nome <span className="text-red-500">*</span>
          </label>
          <Input
            id="nome"
            name="nome"
            type="text"
            required
            minLength={3}
            maxLength={100}
            autoComplete="name"
            defaultValue={nomeAtual}
            onChange={(e) => setNomeDraft(e.target.value)}
            placeholder="Como quer aparecer no feed"
          />
          <FieldError errors={state.errors?.nome} />
        </div>
      ) : (
        <input type="hidden" name="nome" value={nomeAtual} />
      )}

      {pedirEmail ? (
        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-sm font-medium text-[rgb(var(--foreground))]"
          >
            E-mail <span className="text-red-500">*</span>
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={emailAtual}
            placeholder="seu@email.com"
          />
          <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
            Usado para avisos e para vincular Discord/Google depois.
          </p>
          <FieldError errors={state.errors?.email} />
        </div>
      ) : (
        <input type="hidden" name="email" value={emailAtual} />
      )}

      <NicknameField
        id="nickname"
        defaultValue={nicknameAtual ?? sugestao}
        nicknameAtual={nicknameAtual}
        suggestFromNome={pedirNome && !nicknameAtual ? nomeDraft : undefined}
        label={
          <>
            Seu @ <span className="text-red-500">*</span>
          </>
        }
        helperText="Único na plataforma · letras, números e _ · 3 a 20 caracteres. Aparece abaixo do seu nome no feed."
        errors={state.errors?.nickname}
        autoFocus={soNickname}
        onDisponivelChange={setNickDisponivel}
      />

      <SubmitButton
        label={soNickname && nicknameAtual ? 'Salvar e continuar' : 'Continuar'}
        icon={<AtSign className="h-4 w-4" />}
        disabled={!nickDisponivel}
      />
    </form>
  )
}
