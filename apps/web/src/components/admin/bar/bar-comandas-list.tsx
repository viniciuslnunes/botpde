'use client'

import { useActionState, useState } from 'react'
import { ReceiptText } from 'lucide-react'
import {
  METODO_PAGAMENTO_BAR_LABEL,
  METODO_PAGAMENTO_QUITACAO_FIADO_BAR,
} from '@torcida/types'
import {
  cancelarComandaBar,
  quitarComandaBar,
  type BarComandaActionState,
} from '@/app/admin/bar/comanda-actions'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { useActionStateToast } from '@/lib/toast-action'

export type BarComandaListItem = {
  id: string
  codigo: string
  titularNome: string
  totalLabel: string
  saldoLabel: string | null
  limiteLabel: string | null
  vencimentoLabel: string | null
  abertaEmLabel: string
  status: string
  statusLabel: string
  metaLabel: string
}

const STATUS_COMANDA_COR: Record<string, string> = {
  ABERTA: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
  FECHADA_COM_DEBITO:
    'bg-[rgb(var(--color-warning)_/_0.14)] text-[rgb(var(--color-warning-fg))]',
  VENCIDA: 'bg-[rgb(var(--color-danger)_/_0.14)] text-[rgb(var(--color-danger-fg))]',
  FECHADA_PAGA: 'bg-[rgb(var(--color-success)_/_0.14)] text-[rgb(var(--color-success-fg))]',
  QUITADA: 'bg-[rgb(var(--color-success)_/_0.14)] text-[rgb(var(--color-success-fg))]',
  CANCELADA: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
}

const METODOS_QUITACAO = METODO_PAGAMENTO_QUITACAO_FIADO_BAR.filter((m: string) => m !== 'PIX')

function StatusComandaBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COMANDA_COR[status] ?? 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]'}`}
    >
      {label}
    </span>
  )
}

const initialState: BarComandaActionState = {}

async function quitarComandaForm(
  _prev: BarComandaActionState,
  formData: FormData,
): Promise<BarComandaActionState> {
  const result = await quitarComandaBar(Object.fromEntries(formData))
  if (!result.success) return { error: result.error }
  return { success: true }
}

async function cancelarComandaForm(
  _prev: BarComandaActionState,
  formData: FormData,
): Promise<BarComandaActionState> {
  const result = await cancelarComandaBar(Object.fromEntries(formData))
  if (result.error) return { error: result.error }
  return { success: true }
}

function QuitarComandaForm({
  comanda,
  saldoDefault,
  onClose,
}: {
  comanda: BarComandaListItem
  saldoDefault: string
  onClose: () => void
}) {
  const [state, action, pending] = useActionState(quitarComandaForm, initialState)
  useActionStateToast(state, pending, 'Comanda quitada.', {
    successDescription: 'Receita lançada no livro-caixa.',
    onSuccess: onClose,
  })

  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-2 rounded-xl bg-[rgb(var(--background-subtle))] px-3 py-2.5"
    >
      <input type="hidden" name="comandaId" value={comanda.id} />
      <div>
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Método
        </label>
        <select
          name="metodo"
          defaultValue=""
          required
          className="mt-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2.5 py-1.5 text-xs"
        >
          <option value="" disabled>
            Selecione
          </option>
          {METODOS_QUITACAO.map((m: string) => (
            <option key={m} value={m}>
              {METODO_PAGAMENTO_BAR_LABEL[m] ?? m}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Valor (R$)
        </label>
        <input
          type="number"
          name="valor"
          required
          min={0.01}
          step="0.01"
          defaultValue={saldoDefault}
          className="mt-1 w-28 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2.5 py-1.5 text-xs tabular-nums"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-medium text-primary-on disabled:opacity-50"
      >
        {pending ? 'Quitando...' : 'Confirmar quitação'}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onClose}
        className="rounded-lg px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]"
      >
        Voltar
      </button>
      {state.error && (
        <p className="w-full text-xs text-[rgb(var(--color-danger-fg))]">{state.error}</p>
      )}
    </form>
  )
}

function CancelarDebitoForm({
  comanda,
  onClose,
}: {
  comanda: BarComandaListItem
  onClose: () => void
}) {
  const [state, action, pending] = useActionState(cancelarComandaForm, initialState)
  useActionStateToast(state, pending, 'Débito cancelado.', {
    successDescription: 'Perdão de dívida — estoque não é estornado.',
    onSuccess: onClose,
  })

  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-2 rounded-xl bg-[rgb(var(--color-danger)_/_0.06)] px-3 py-2.5"
    >
      <input type="hidden" name="comandaId" value={comanda.id} />
      <div className="min-w-40 flex-1">
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Motivo (perdão de dívida)
        </label>
        <input
          name="motivo"
          required
          minLength={3}
          maxLength={200}
          placeholder="Ex.: acordo com o associado"
          className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2.5 py-1.5 text-xs"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[rgb(var(--color-danger)_/_0.9)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Cancelando...' : 'Cancelar débito'}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onClose}
        className="rounded-lg px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))]"
      >
        Voltar
      </button>
      {state.error && (
        <p className="w-full text-xs text-[rgb(var(--color-danger-fg))]">{state.error}</p>
      )}
    </form>
  )
}

function ComandaRow({
  comanda,
  podeGerir,
  modo,
  saldoNumerico,
}: {
  comanda: BarComandaListItem
  podeGerir: boolean
  modo: 'abertas' | 'em_aberto' | 'historico'
  saldoNumerico: number | null
}) {
  const [acao, setAcao] = useState<'quitar' | 'cancelar' | null>(null)
  const podeAgir =
    podeGerir && modo === 'em_aberto' && (comanda.status === 'FECHADA_COM_DEBITO' || comanda.status === 'VENCIDA')

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[rgb(var(--foreground))]">
            {comanda.codigo}
            <span className="font-normal text-[rgb(var(--foreground-muted))]">
              {' '}
              · {comanda.titularNome}
            </span>
          </p>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">{comanda.metaLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums text-[rgb(var(--foreground))]">
              {modo === 'em_aberto' && comanda.saldoLabel
                ? comanda.saldoLabel
                : comanda.totalLabel}
            </p>
            {modo === 'em_aberto' && (
              <p className="text-[10px] text-[rgb(var(--foreground-muted))]">
                total {comanda.totalLabel}
              </p>
            )}
          </div>
          <StatusComandaBadge status={comanda.status} label={comanda.statusLabel} />
          {podeAgir && acao === null && (
            <>
              <button
                type="button"
                onClick={() => setAcao('quitar')}
                className="rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-xs font-medium hover:bg-[rgb(var(--background-subtle))]"
              >
                Registrar quitação
              </button>
              <button
                type="button"
                onClick={() => setAcao('cancelar')}
                className="rounded-lg border border-[rgb(var(--color-danger)_/_0.35)] px-2.5 py-1 text-xs font-medium text-[rgb(var(--color-danger-fg))] hover:bg-[rgb(var(--color-danger)_/_0.08)]"
              >
                Cancelar débito
              </button>
            </>
          )}
        </div>
      </div>
      {acao === 'quitar' && saldoNumerico != null && (
        <QuitarComandaForm
          comanda={comanda}
          saldoDefault={String(saldoNumerico)}
          onClose={() => setAcao(null)}
        />
      )}
      {acao === 'cancelar' && (
        <CancelarDebitoForm comanda={comanda} onClose={() => setAcao(null)} />
      )}
    </li>
  )
}

const EMPTY_COPY: Record<
  'abertas' | 'em_aberto' | 'historico',
  { title: string; description: string }
> = {
  abertas: {
    title: 'Nenhuma comanda aberta',
    description: 'Abra uma comanda no PDV para acumular consumo nesta unidade.',
  },
  em_aberto: {
    title: 'Nenhum débito em aberto',
    description: 'Comandas fechadas com saldo (crédito) aparecem aqui até quitação ou cancelamento.',
  },
  historico: {
    title: 'Nenhum histórico recente',
    description: 'Comandas pagas, quitadas ou canceladas desta unidade aparecem aqui.',
  },
}

export function BarComandasList({
  comandas,
  modo,
  podeGerir,
  saldos,
}: {
  comandas: BarComandaListItem[]
  modo: 'abertas' | 'em_aberto' | 'historico'
  podeGerir: boolean
  /** id → saldo numérico (só em_aberto) para default do form de quitação */
  saldos?: Record<string, number>
}) {
  if (comandas.length === 0) {
    const copy = EMPTY_COPY[modo]
    return (
      <MotionEmptyState
        icon={<ReceiptText className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
        title={copy.title}
        description={copy.description}
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center"
      />
    )
  }

  return (
    <ul className="divide-y divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      {comandas.map((c) => (
        <ComandaRow
          key={c.id}
          comanda={c}
          podeGerir={podeGerir}
          modo={modo}
          saldoNumerico={saldos?.[c.id] ?? null}
        />
      ))}
    </ul>
  )
}
