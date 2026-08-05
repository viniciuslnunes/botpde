'use client'

import { useActionState, useEffect, useRef } from 'react'
import { TIPO_COBRANCA_LABEL, formatDataCompetenciaInput } from '@torcida/types'
import { criarCobranca, type CobrancaActionState } from './actions'
import { DatePicker } from '@/components/ui/date-picker'
import { useActionStateToast } from '@/lib/toast-action'

const TIPOS = Object.keys(TIPO_COBRANCA_LABEL)

export type MembroOption = { userId: string; label: string }
export type PlanoOption = { id: string; nome: string; valor: number }

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.[0]) return null
  return <span className="mt-1 block text-xs text-red-600">{messages[0]}</span>
}

function proximoMesISODate() {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return formatDataCompetenciaInput(d)
}

export function AdminCriarCobrancaForm({
  membros,
  planos,
}: {
  membros: MembroOption[]
  planos: PlanoOption[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, action, pending] = useActionState(criarCobranca, {} as CobrancaActionState)
  useActionStateToast(state, pending, 'Cobrança criada.')

  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state.ok])

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5"
    >
      <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Nova cobrança</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))] sm:col-span-2">
          Associado
          <select
            name="userId"
            required
            defaultValue=""
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Selecione…
            </option>
            {membros.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.label}
              </option>
            ))}
          </select>
          <FieldError messages={state.errors?.userId} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Tipo
          <select
            name="tipo"
            defaultValue="MENSALIDADE"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPO_COBRANCA_LABEL[t as keyof typeof TIPO_COBRANCA_LABEL]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Plano (opcional)
          <select
            name="planoAssociacaoId"
            defaultValue=""
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
            onChange={(e) => {
              const plano = planos.find((p) => p.id === e.target.value)
              if (!plano) return
              const form = e.target.form
              if (!form) return
              const valorInput = form.elements.namedItem('valor') as HTMLInputElement | null
              const descInput = form.elements.namedItem('descricao') as HTMLInputElement | null
              if (valorInput) valorInput.value = String(plano.valor)
              if (descInput && !descInput.value) descInput.value = `Mensalidade — ${plano.nome}`
            }}
          >
            <option value="">—</option>
            {planos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))] sm:col-span-2">
          Descrição
          <input
            name="descricao"
            required
            placeholder="Ex.: Mensalidade março/2026"
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          />
          <FieldError messages={state.errors?.descricao} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Valor (R$)
          <input
            name="valor"
            type="number"
            step="0.01"
            min="0.01"
            required
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          />
          <FieldError messages={state.errors?.valor} />
        </label>

        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Vencimento
          <div className="mt-1">
            <DatePicker
              name="vencimento"
              required
              defaultValue={proximoMesISODate()}
              aria-label="Vencimento"
            />
          </div>
          <FieldError messages={state.errors?.vencimento} />
        </label>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || membros.length === 0}
        className="rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Criando…' : 'Criar cobrança'}
      </button>
    </form>
  )
}
