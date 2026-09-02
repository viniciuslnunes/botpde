'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PERIODICIDADE_PLANO_LABEL } from '@torcida/types'
import {
  atualizarPlanoAssociacao,
  criarPlanoAssociacao,
  type PlanoState,
} from './actions'
import { useActionStateToast } from '@/lib/toast-action'
import { AppButton } from '@/components/ui/button'
import { X } from 'lucide-react'

const PERIODICIDADES = Object.keys(PERIODICIDADE_PLANO_LABEL)

export type PlanoFormInitial = {
  id?: string
  nome: string
  descricao: string | null
  valor?: number
  periodicidade: string
  beneficios: string | null
  ativo: boolean
  oferecerOnboarding?: boolean
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.[0]) return null
  return <span className="mt-1 block text-xs text-red-600">{messages[0]}</span>
}

export function AdminPlanoForm({
  initial,
  variant = 'page',
  lockPeriodicidade = false,
  onDismiss,
}: {
  initial?: PlanoFormInitial
  variant?: 'page' | 'drawer'
  lockPeriodicidade?: boolean
  onDismiss?: () => void
}) {
  const isEdit = Boolean(initial?.id)
  const embedded = variant === 'drawer'
  const router = useRouter()
  const [state, action, pending] = useActionState(
    isEdit ? atualizarPlanoAssociacao : criarPlanoAssociacao,
    {} as PlanoState,
  )
  useActionStateToast(state, pending, isEdit ? 'Plano atualizado.' : 'Plano criado.', {
    onSuccess: () => {
      if (onDismiss) {
        router.refresh()
        onDismiss()
        return
      }
      router.push('/admin/financeiro/planos')
    },
  })

  const periodicidadeTravada = lockPeriodicidade && Boolean(initial?.periodicidade)

  return (
    <form
      action={action}
      className={
        embedded
          ? 'space-y-3'
          : 'space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5'
      }
    >
      {isEdit && <input type="hidden" name="id" value={initial!.id} />}
      {embedded ? null : (
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
          {isEdit ? 'Editar plano' : 'Novo plano de associação'}
        </h2>
      )}

      <div className={embedded ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2'}>
        {embedded ? (
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Valor (R$)
            <input
              name="valor"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={initial?.valor ?? ''}
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            />
            <FieldError messages={state.errors?.valor} />
          </label>
        ) : null}

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))] sm:col-span-2">
          Nome
          <input
            name="nome"
            required
            defaultValue={initial?.nome ?? ''}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          />
          <FieldError messages={state.errors?.nome} />
        </label>

        {embedded ? null : (
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Valor (R$)
            <input
              name="valor"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={initial?.valor ?? ''}
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            />
            <FieldError messages={state.errors?.valor} />
          </label>
        )}

        {periodicidadeTravada ? (
          <div className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Periodicidade
            <input type="hidden" name="periodicidade" value={initial!.periodicidade} />
            <p className="mt-1 text-sm font-medium text-[rgb(var(--foreground))]">
              {PERIODICIDADE_PLANO_LABEL[
                initial!.periodicidade as keyof typeof PERIODICIDADE_PLANO_LABEL
              ] ?? initial!.periodicidade}
            </p>
          </div>
        ) : (
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Periodicidade
            <select
              name="periodicidade"
              defaultValue={initial?.periodicidade ?? 'MENSAL'}
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            >
              {PERIODICIDADES.map((p) => (
                <option key={p} value={p}>
                  {PERIODICIDADE_PLANO_LABEL[p as keyof typeof PERIODICIDADE_PLANO_LABEL]}
                </option>
              ))}
            </select>
            <FieldError messages={state.errors?.periodicidade} />
          </label>
        )}

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))] sm:col-span-2">
          Descrição
          <textarea
            name="descricao"
            rows={2}
            defaultValue={initial?.descricao ?? ''}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          />
          <FieldError messages={state.errors?.descricao} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))] sm:col-span-2">
          Benefícios
          <textarea
            name="beneficios"
            rows={2}
            defaultValue={initial?.beneficios ?? ''}
            placeholder="Ex.: desconto na loja, prioridade em caravanas…"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          />
          <FieldError messages={state.errors?.beneficios} />
        </label>

        <label className="flex items-center gap-2 text-sm text-[rgb(var(--foreground))] sm:col-span-2">
          <input
            type="checkbox"
            name="ativo"
            defaultChecked={initial?.ativo ?? true}
            className="rounded border-[rgb(var(--border))]"
          />
          Plano ativo (disponível para novos vínculos e cobranças)
        </label>

        <label className="flex items-start gap-2 text-sm text-[rgb(var(--foreground))] sm:col-span-2">
          <input
            type="checkbox"
            name="oferecerOnboarding"
            defaultChecked={initial?.oferecerOnboarding ?? true}
            className="mt-0.5 rounded border-[rgb(var(--border))]"
          />
          <span>
            Oferecer no onboarding «Já sou sócio»
            <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
              Inclui esta periodicidade nas opções do cadastro. Sem valor cadastrado, o
              wizard mostra só o nome do ciclo.
            </span>
          </span>
        </label>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-primary-on disabled:opacity-60"
        >
          {pending ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar plano'}
        </button>
        {onDismiss ? (
          <AppButton
            variant="none"
            icon={X}
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium"
          >
            Cancelar
          </AppButton>
        ) : (
          <Link
            href="/admin/financeiro/planos"
            className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium"
          >
            Cancelar
          </Link>
        )}
      </div>
    </form>
  )
}
