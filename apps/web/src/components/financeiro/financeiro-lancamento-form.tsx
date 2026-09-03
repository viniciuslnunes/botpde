'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
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
import { DatePicker } from '@/components/ui/date-picker'
import { useActionStateToast } from '@/lib/toast-action'
import { AppButton } from '@/components/ui/button'
import { X } from 'lucide-react'

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
  departamentoId?: string | null
  projetoId?: string | null
  eventoId?: string | null
}

/** Opções de rateio — carregadas na página, já escopadas por tenant. */
export type RateioOpcoes = {
  departamentos: Array<{ id: string; nome: string }>
  projetos: Array<{ id: string; titulo: string; departamentoId: string }>
  /** Operações da janela (caravana, festa, ensaio) para fechar o resultado. */
  eventos?: Array<{ id: string; titulo: string; data: Date | string; tipo: string }>
}

function formatarOperacao(evento: { titulo: string; data: Date | string }): string {
  const data = new Date(evento.data)
  const dia = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(data)
  return `${dia} · ${evento.titulo}`
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
  rateio,
}: {
  initial?: LancamentoFormInitial
  onCancel?: () => void
  compact?: boolean
  /** Ausente = torcida sem departamentos; o bloco de rateio nem aparece. */
  rateio?: RateioOpcoes
}) {
  const isEdit = Boolean(initial?.id)
  const [departamentoId, setDepartamentoId] = useState(initial?.departamentoId ?? '')
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
          <div className="mt-1">
            <DatePicker
              name="data"
              required
              defaultValue={initial?.data ?? hojeISODate()}
              aria-label="Data de competência"
            />
          </div>
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

      {rateio && rateio.departamentos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Departamento (opcional)
            <select
              name="departamentoId"
              value={departamentoId}
              onChange={(e) => setDepartamentoId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
            >
              <option value="">Sem rateio por área</option>
              {rateio.departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
            <FieldError messages={state.errors?.departamentoId} />
          </label>

          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Projeto (opcional)
            <select
              name="projetoId"
              defaultValue={initial?.projetoId ?? ''}
              key={departamentoId}
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
            >
              <option value="">Nenhum</option>
              {rateio.projetos
                .filter((p) => !departamentoId || p.departamentoId === departamentoId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.titulo}
                  </option>
                ))}
            </select>
            <FieldError messages={state.errors?.projetoId} />
          </label>

          {(rateio.eventos?.length ?? 0) > 0 && (
            <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))] sm:col-span-2">
              Operação (opcional)
              <select
                name="eventoId"
                defaultValue={initial?.eventoId ?? ''}
                className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
              >
                <option value="">Nenhuma</option>
                {rateio.eventos?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {formatarOperacao(e)}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] font-normal text-[rgb(var(--foreground-muted))]">
                Amarra o lançamento ao dia — é o que fecha o resultado da caravana ou da festa.
              </span>
              <FieldError messages={state.errors?.eventoId} />
            </label>
          )}
        </div>
      )}

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
          className="app-action rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-primary-on disabled:opacity-50"
        >
          {pending ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Registrar'}
        </button>
        {onCancel && (
          <AppButton
            variant="none"
            icon={X}
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))]"
          >
            Cancelar
          </AppButton>
        )}
      </div>
    </form>
  )
}
