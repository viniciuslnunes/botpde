'use client'

import { useActionState, useState } from 'react'
import { criarContaComSenha, type ContaState } from '../actions'
import { AuthRedirectEffect } from '@/components/auth-redirect-effect'
import { UserCircle2, Mail, Lock, ChevronRight, AtSign, Eye, EyeOff } from 'lucide-react'
import { FieldError, Input, SubmitButton, hexToRgb } from '@torcida/ui'

export function CriarContaForm({ corPrimaria = '#7c3aed' }: { corPrimaria?: string }) {
  const [state, action] = useActionState<ContaState, FormData>(criarContaComSenha, {})
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false)

  return (
    <form action={action} className="space-y-4">
      <AuthRedirectEffect redirectTo={state.redirectTo} />
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
        <label
          htmlFor="nickname"
          className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]"
        >
          <span className="flex items-center gap-1.5">
            <AtSign className="h-3.5 w-3.5" />
            Apelido <span className="text-red-500">*</span>
          </span>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[rgb(var(--foreground-muted))]">@</span>
          <Input
            id="nickname"
            name="nickname"
            type="text"
            placeholder="seu_apelido"
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
            pattern="[a-zA-Z0-9_]*"
            required
            className="flex-1"
          />
        </div>
        <p className="mt-1.5 text-xs text-[rgb(var(--foreground-muted))]">
          Único na plataforma · letras, números e _ · 3 a 20 caracteres.
        </p>
        <FieldError errors={state.errors?.nickname} />
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
        <div className="relative">
          <Input
            id="senha"
            name="senha"
            type={mostrarSenha ? 'text' : 'password'}
            placeholder="Mínimo 8 caracteres"
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
        <FieldError errors={state.errors?.senha} />
      </div>

      <div>
        <label htmlFor="confirmarSenha" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Confirmar senha
        </label>
        <div className="relative">
          <Input
            id="confirmarSenha"
            name="confirmarSenha"
            type={mostrarConfirmar ? 'text' : 'password'}
            placeholder="Repita a senha"
            minLength={8}
            required
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setMostrarConfirmar((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
            aria-label={mostrarConfirmar ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {mostrarConfirmar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <FieldError errors={state.errors?.confirmarSenha} />
      </div>

      <div className="pt-2" style={{ '--color-primary': hexToRgb(corPrimaria) } as React.CSSProperties}>
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
