'use client'

import { useActionState } from 'react'
import { salvarPerfil, type PerfilState } from '@/app/portal/perfil/actions'
import { Save, CheckCircle2 } from 'lucide-react'
import { FieldError, Input, SubmitButton } from '@torcida/ui'
import { useActionStateToast } from '@/lib/toast-action'
import { useTrackedForm } from '@/lib/unsaved-changes'

type Props = {
  nome: string
  idade?: number | null
  telefone?: string | null
  cidade?: string | null
  discordTag?: string | null
  temMembro: boolean
}

export function PerfilForm({ nome, idade, telefone, cidade, discordTag, temMembro }: Props) {
  const [state, action, pending] = useActionState<PerfilState, FormData>(salvarPerfil, {})
  const { formRef, markPristine } = useTrackedForm({ title: 'Dados do perfil' })
  useActionStateToast(state, pending, 'Perfil atualizado.', { onSuccess: markPristine })

  return (
    <form ref={formRef} action={action} className="space-y-5">
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
        <Input
          id="nome"
          name="nome"
          type="text"
          defaultValue={nome}
          required
         
        />
        <FieldError errors={state.errors?.nome} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Idade */}
        <div>
          <label htmlFor="idade" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Idade
          </label>
          <Input
            id="idade"
            name="idade"
            type="number"
            min={10}
            max={120}
            defaultValue={idade ?? ''}
            placeholder="Ex: 25"
           
          />
          <FieldError errors={state.errors?.idade} />
        </div>

        {/* Telefone */}
        <div>
          <label htmlFor="telefone" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Telefone / WhatsApp
          </label>
          <Input
            id="telefone"
            name="telefone"
            type="tel"
            defaultValue={telefone ?? ''}
            placeholder="(11) 99999-9999"
           
          />
          <FieldError errors={state.errors?.telefone} />
        </div>
      </div>

      {/* Cidade */}
      <div>
        <label htmlFor="cidade" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Cidade / Estado
        </label>
        <Input
          id="cidade"
          name="cidade"
          type="text"
          defaultValue={cidade ?? ''}
          placeholder="Ex: São Paulo, SP"
         
        />
        <FieldError errors={state.errors?.cidade} />
      </div>

      {/* Discord */}
      <div>
        <label htmlFor="discordTag" className="mb-1.5 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Usuário no Discord
        </label>
        <Input
          id="discordTag"
          name="discordTag"
          type="text"
          defaultValue={discordTag ?? ''}
          placeholder="Ex: seuusuario"
         
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

      <SubmitButton label="Salvar alterações" icon={<Save className="h-4 w-4" />} />
    </form>
  )
}
