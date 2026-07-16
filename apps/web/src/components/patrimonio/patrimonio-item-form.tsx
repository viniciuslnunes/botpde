'use client'

import { useActionState, useEffect, useRef } from 'react'
import {
  CATEGORIA_PATRIMONIO_LABEL,
  STATUS_PATRIMONIO_LABEL,
} from '@torcida/types'
import {
  criarPatrimonioItem,
  editarPatrimonioItem,
  type PatrimonioState,
} from '@/app/admin/patrimonio/actions'
import { useActionStateToast } from '@/lib/toast-action'

const CATEGORIAS = Object.keys(CATEGORIA_PATRIMONIO_LABEL)
const STATUS = Object.keys(STATUS_PATRIMONIO_LABEL)

export type PatrimonioFormInitial = {
  id?: string
  nome: string
  categoria: string
  status: string
  quantidade: number
  localizacao: string | null
  valorEstimado: number | null
  observacao: string | null
  responsavelId: string | null
}

export type ResponsavelOption = { id: string; nome: string | null; email: string }

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.[0]) return null
  return <span className="mt-1 block text-xs text-red-600">{messages[0]}</span>
}

export function PatrimonioItemForm({
  initial,
  candidatos,
  onCancel,
  compact,
}: {
  initial?: PatrimonioFormInitial
  candidatos: ResponsavelOption[]
  onCancel?: () => void
  compact?: boolean
}) {
  const isEdit = Boolean(initial?.id)
  const formRef = useRef<HTMLFormElement>(null)
  const [state, action, pending] = useActionState(
    isEdit ? editarPatrimonioItem : criarPatrimonioItem,
    {} as PatrimonioState,
  )
  useActionStateToast(state, pending, isEdit ? 'Item atualizado.' : 'Item cadastrado.')

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
        {isEdit ? 'Editar item' : 'Novo item'}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))] sm:col-span-2">
          Nome
          <input
            name="nome"
            required
            maxLength={120}
            defaultValue={initial?.nome}
            placeholder="Ex.: Surdo 22&quot; — bateria"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          />
          <FieldError messages={state.errors?.nome} />
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
                {CATEGORIA_PATRIMONIO_LABEL[c]}
              </option>
            ))}
          </select>
          <FieldError messages={state.errors?.categoria} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Status
          <select
            name="status"
            required
            defaultValue={initial?.status ?? 'DISPONIVEL'}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          >
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {STATUS_PATRIMONIO_LABEL[s]}
              </option>
            ))}
          </select>
          <FieldError messages={state.errors?.status} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Quantidade
          <input
            name="quantidade"
            type="number"
            min={1}
            required
            defaultValue={initial?.quantidade ?? 1}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          />
          <FieldError messages={state.errors?.quantidade} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Valor estimado (R$, opcional)
          <input
            name="valorEstimado"
            type="number"
            step="0.01"
            min="0"
            defaultValue={initial?.valorEstimado ?? ''}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          />
          <FieldError messages={state.errors?.valorEstimado} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))] sm:col-span-2">
          Localização
          <input
            name="localizacao"
            maxLength={200}
            defaultValue={initial?.localizacao ?? ''}
            placeholder="Ex.: Sede — depósito / sala da bateria"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          />
          <FieldError messages={state.errors?.localizacao} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))] sm:col-span-2">
          Responsável
          <select
            name="responsavelId"
            defaultValue={initial?.responsavelId ?? ''}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
          >
            <option value="">Sem responsável</option>
            {candidatos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome ?? c.email}
              </option>
            ))}
          </select>
          <FieldError messages={state.errors?.responsavelId} />
        </label>
      </div>

      <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
        Observação
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
          {pending ? 'Salvando…' : isEdit ? 'Salvar' : 'Cadastrar'}
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
