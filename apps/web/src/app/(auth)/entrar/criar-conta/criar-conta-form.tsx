'use client'

import { useActionState, useState } from 'react'
import { criarContaComSenha, type ContaState } from '../actions'
import { AuthRedirectEffect } from '@/components/auth-redirect-effect'
import { UserCircle2, Mail, Lock, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { FieldError, Input, SubmitButton, hexToRgb } from '@torcida/ui'
import { NicknameField } from '@/components/nickname-field'

export function CriarContaForm({
  corPrimaria = '#7c3aed',
  callbackUrl,
}: {
  corPrimaria?: string
  /** Destino a retomar depois do cadastro (ex.: convite de unidade). */
  callbackUrl?: string | null
}) {
  const [state, action] = useActionState<ContaState, FormData>(criarContaComSenha, {})
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [nome, setNome] = useState('')
  const [nickDisponivel, setNickDisponivel] = useState(false)

  return (
    <form
      action={action}
      className="space-y-4"
      onSubmit={(e) => {
        if (!nickDisponivel) e.preventDefault()
      }}
    >
      <AuthRedirectEffect
        redirectTo={state.redirectTo}
        message="Preparando seu onboarding..."
        description="Estamos configurando sua conta e carregando os clubes."
      />
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
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
        <Input
          id="nome"
          name="nome"
          type="text"
          placeholder="Seu nome completo"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          minLength={3}
        />
        <FieldError errors={state.errors?.nome} />
      </div>

      <NicknameField
        id="nickname"
        suggestFromNome={nome}
        errors={state.errors?.nickname}
        onDisponivelChange={setNickDisponivel}
      />

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
        <div className="relative">
          <Input
            id="senha"
            name="senha"
            type={mostrarSenha ? 'text' : 'password'}
            placeholder="Mín. 8 caracteres, letras e número"
            minLength={8}
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
        <p className="mt-1.5 text-xs text-[rgb(var(--foreground-muted))]">
          Letras e pelo menos um número · use o olho para conferir.
        </p>
        <FieldError errors={state.errors?.senha} />
      </div>

      <div className="pt-2" style={{ '--color-primary': hexToRgb(corPrimaria) } as React.CSSProperties}>
        <SubmitButton
          label="Criar conta"
          pendingLabel="Criando..."
          icon={<ChevronRight className="h-4 w-4" />}
          iconPosition="trailing"
          fullWidth
          disabled={!nickDisponivel}
        />
      </div>
    </form>
  )
}
