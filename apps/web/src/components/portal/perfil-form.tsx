'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { salvarPerfil, type PerfilState } from '@/app/portal/perfil/actions'
import { Loader2, Save, CheckCircle2 } from 'lucide-react'

const inputClass =
  'w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-2.5 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] outline-none focus:border-transparent focus:ring-2 focus:ring-[rgb(var(--color-primary))] transition-all'

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null
  return <p className="mt-1 text-xs text-red-500">{errors[0]}</p>
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 rounded-lg bg-[rgb(var(--color-primary))] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {pending ? 'Salvando...' : 'Salvar alterações'}
    </button>
  )
}

type Props = {
  nome: string
  idade?: number | null
  telefone?: string | null
  cidade?: string | null
  discordTag?: string | null
  temMembro: boolean
}

export function PerfilForm({ nome, idade, telefone, cidade, discordTag, temMembro }: Props) {
  const [state, action] = useActionState<PerfilState, FormData>(salvarPerfil, {})

  return (
    <form action={action} className="space-y-5">
      {state.success && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Perfil atualizado com sucesso!
        </div>
      )}

      {state.message && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      {/* Nome */}
      <div>
        <label htmlFor="nome" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Nome completo <span className="text-red-500">*</span>
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          defaultValue={nome}
          required
          className={inputClass}
        />
        <FieldError errors={state.errors?.nome} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Idade */}
        <div>
          <label htmlFor="idade" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Idade
          </label>
          <input
            id="idade"
            name="idade"
            type="number"
            min={10}
            max={120}
            defaultValue={idade ?? ''}
            placeholder="Ex: 25"
            className={inputClass}
          />
          <FieldError errors={state.errors?.idade} />
        </div>

        {/* Telefone */}
        <div>
          <label htmlFor="telefone" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Telefone / WhatsApp
          </label>
          <input
            id="telefone"
            name="telefone"
            type="tel"
            defaultValue={telefone ?? ''}
            placeholder="(11) 99999-9999"
            className={inputClass}
          />
          <FieldError errors={state.errors?.telefone} />
        </div>
      </div>

      {/* Cidade */}
      <div>
        <label htmlFor="cidade" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Cidade / Estado
        </label>
        <input
          id="cidade"
          name="cidade"
          type="text"
          defaultValue={cidade ?? ''}
          placeholder="Ex: São Paulo, SP"
          className={inputClass}
        />
        <FieldError errors={state.errors?.cidade} />
      </div>

      {/* Discord */}
      <div>
        <label htmlFor="discordTag" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Usuário no Discord
        </label>
        <input
          id="discordTag"
          name="discordTag"
          type="text"
          defaultValue={discordTag ?? ''}
          placeholder="Ex: seuusuario"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
          Para vincular sua conta ao servidor da torcida no Discord.
        </p>
        <FieldError errors={state.errors?.discordTag} />
      </div>

      {!temMembro && (
        <p className="rounded-xl bg-[rgb(var(--background-subtle))] p-3 text-xs text-[rgb(var(--foreground-muted))]">
          Os campos acima serão salvos no seu perfil. Quando solicitar filiação, serão
          pré-preenchidos automaticamente.
        </p>
      )}

      <SubmitButton />
    </form>
  )
}
