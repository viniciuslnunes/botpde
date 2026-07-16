'use client'

import { useActionState, useEffect, useRef } from 'react'
import {
  CATEGORIA_FINANCEIRO_LABEL,
  formatDataCompetenciaInput,
  TIPO_FINANCEIRO_LABEL,
} from '@torcida/types'
import {
  criarLancamentoFinanceiro,
  editarLancamentoFinanceiro,
  type LancamentoState,
} from '@/app/admin/financeiro/actions'
import { useActionStateToast } from '@/lib/toast-action'

const CATEGORIAS = Object.keys(CATEGORIA_FINANCEIRO_LABEL)
const TIPOS = Object.keys(TIPO_FINANCEIRO_LABEL)

export type LancamentoFormInitial = {
  id?: string
  tipo: string
  categoria: string
  valor: number
  descricao: string
  data: string
  observacao: string | null
}

function hojeISODate() {
  return formatDataCompetenciaInput(new Date())
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.[0]) return null
  return <span className="mt-1 block text-xs text-red-600">{messages[0]}</span>
}

export function FinanceiroLancamentoForm({
  initial,
  onCancel,
  compact,
}: {
  initial?: LancamentoFormInitial
  onCancel?: () => void
  compact?: boolean
}) {
  const isEdit = Boolean(initial?.id)
  const formRef = useRef<HTMLFormElement>(null)
  const [state, action, pending] = useActionState(
    isEdit ? editarLancamentoFinanceiro : criarLancamentoFinanceiro,
    {} as LancamentoState,
  )
  useActionStateToast(
    state,
    pending,
    isEdit ? 'Lançamento atualizado.' : 'Lançamento registrado.',
  )

  useEffect(() => {
    if (state.ok && !isEdit) formRef.current?.reset()
    if (state.ok && isEdit) onCancel?.()
  }, [state.ok, isEdit, onCancel])

  return (
    <form
      ref={formRef}
      action={action}
      className={
        compact
          ? 'space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-4'
          : 'space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5'
      }
    >
      {isEdit && <input type="hidden" name="id" value={initial!.id} />}
      <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
        {isEdit ? 'Editar lançamento' : 'Novo lançamento'}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Tipo
          <select
            name="tipo"
            required
            defaultValue={initial?.tipo ?? 'RECEITA'}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPO_FINANCEIRO_LABEL[t]}
              </option>
            ))}
          </select>
          <FieldError messages={state.errors?.tipo} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Categoria
          <select
            name="categoria"
            required
            defaultValue={initial?.categoria ?? 'OUTROS'}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_FINANCEIRO_LABEL[c]}
              </option>
            ))}
          </select>
          <FieldError messages={state.errors?.categoria} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Valor (R$)
          <input
            name="valor"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={initial?.valor}
            placeholder="0,00"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          />
          <FieldError messages={state.errors?.valor} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Data de competência
          <input
            name="data"
            type="date"
            required
            defaultValue={initial?.data ?? hojeISODate()}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          />
          <FieldError messages={state.errors?.data} />
        </label>
      </div>

      <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Descrição
        <input
          name="descricao"
          required
          maxLength={200}
          defaultValue={initial?.descricao}
          placeholder="Ex.: Mensalidade março — lote sede"
          className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
        />
        <FieldError messages={state.errors?.descricao} />
      </label>

      <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Observação (opcional)
        <textarea
          name="observacao"
          rows={2}
          maxLength={500}
          defaultValue={initial?.observacao ?? ''}
          className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
        />
        <FieldError messages={state.errors?.observacao} />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="app-action rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Registrar'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))]"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}
