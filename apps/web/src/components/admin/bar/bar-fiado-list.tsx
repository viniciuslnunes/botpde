'use client'

import { useActionState, useState } from 'react'
import { HandCoins } from 'lucide-react'
import { METODO_PAGAMENTO_QUITACAO_FIADO_BAR, METODO_PAGAMENTO_BAR_LABEL } from '@torcida/types'
import { cancelarFiadoBar, quitarFiadoBar } from '@/app/admin/bar/actions'
import type { BarActionState } from '@/app/admin/bar/actions'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { useActionStateToast } from '@/lib/toast-action'

export type BarFiadoItem = {
  id: string
  devedorNome: string
  valorLabel: string
  vencimentoLabel: string
  status: 'PENDENTE' | 'PAGA' | 'CANCELADA' | 'VENCIDA'
  statusLabel: string
  criadoEmLabel: string
}

const STATUS_FIADO_COR: Record<string, string> = {
  PENDENTE: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
  VENCIDA: 'bg-[rgb(var(--color-danger)_/_0.14)] text-[rgb(var(--color-danger-fg))]',
  PAGA: 'bg-[rgb(var(--color-success)_/_0.14)] text-[rgb(var(--color-success-fg))]',
  CANCELADA: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
}

function StatusFiadoBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_FIADO_COR[status] ?? 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]'}`}
    >
      {label}
    </span>
  )
}

const initialState: BarActionState = {}

function QuitarFiadoForm({ fiado, onClose }: { fiado: BarFiadoItem; onClose: () => void }) {
  const [state, action, pending] = useActionState(quitarFiadoBar, initialState)
  useActionStateToast(state, pending, 'Fiado quitado.', {
    successDescription: 'Receita lançada no livro-caixa.',
    onSuccess: onClose,
  })

  return (
    <form action={action} className="flex flex-wrap items-end gap-2 rounded-xl bg-[rgb(var(--background-subtle))] px-3 py-2.5">
      <input type="hidden" name="fiadoId" value={fiado.id} />
      <div>
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Método de pagamento
        </label>
        <select
          name="metodoPagamento"
          defaultValue=""
          required
          className="mt-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2.5 py-1.5 text-xs"
        >
          <option value="" disabled>
            Selecione
          </option>
          {METODO_PAGAMENTO_QUITACAO_FIADO_BAR.map((m: string) => (
            <option key={m} value={m}>
              {METODO_PAGAMENTO_BAR_LABEL[m] ?? m}
            </option>
          ))}
        </select>
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

function CancelarFiadoForm({ fiado, onClose }: { fiado: BarFiadoItem; onClose: () => void }) {
  const [state, action, pending] = useActionState(cancelarFiadoBar, initialState)
  useActionStateToast(state, pending, 'Fiado cancelado.', {
    successDescription: 'Estoque restaurado.',
    onSuccess: onClose,
  })

  return (
    <form action={action} className="flex flex-wrap items-end gap-2 rounded-xl bg-[rgb(var(--color-danger)_/_0.06)] px-3 py-2.5">
      <input type="hidden" name="fiadoId" value={fiado.id} />
      <div className="min-w-40 flex-1">
        <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Motivo do cancelamento
        </label>
        <input
          name="motivo"
          required
          minLength={3}
          maxLength={200}
          placeholder="Ex.: venda registrada por engano"
          className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2.5 py-1.5 text-xs"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[rgb(var(--color-danger)_/_0.9)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Cancelando...' : 'Confirmar cancelamento'}
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

function FiadoRow({ fiado }: { fiado: BarFiadoItem }) {
  const [acao, setAcao] = useState<'quitar' | 'cancelar' | null>(null)
  const podeAgir = fiado.status === 'PENDENTE' || fiado.status === 'VENCIDA'

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[rgb(var(--foreground))]">{fiado.devedorNome}</p>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            {fiado.criadoEmLabel} · vence em {fiado.vencimentoLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-[rgb(var(--foreground))]">
            {fiado.valorLabel}
          </span>
          <StatusFiadoBadge status={fiado.status} label={fiado.statusLabel} />
          {podeAgir && acao === null && (
            <>
              <button
                type="button"
                onClick={() => setAcao('quitar')}
                className="rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-xs font-medium hover:bg-[rgb(var(--background-subtle))]"
              >
                Registrar quitação
              </button>
              {fiado.status === 'PENDENTE' || fiado.status === 'VENCIDA' ? (
                <button
                  type="button"
                  onClick={() => setAcao('cancelar')}
                  className="rounded-lg border border-[rgb(var(--color-danger)_/_0.35)] px-2.5 py-1 text-xs font-medium text-[rgb(var(--color-danger-fg))] hover:bg-[rgb(var(--color-danger)_/_0.08)]"
                >
                  Cancelar
                </button>
              ) : null}            </>
          )}
        </div>
      </div>
      {acao === 'quitar' && <QuitarFiadoForm fiado={fiado} onClose={() => setAcao(null)} />}
      {acao === 'cancelar' && <CancelarFiadoForm fiado={fiado} onClose={() => setAcao(null)} />}
    </li>
  )
}

export function BarFiadoList({ fiados }: { fiados: BarFiadoItem[] }) {
  if (fiados.length === 0) {
    return (
      <MotionEmptyState
        icon={<HandCoins className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
        title="Nenhum fiado pendente"
        description="Vendas registradas como fiado no PDV aparecem aqui até serem quitadas ou canceladas."
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center"
      />
    )
  }

  return (
    <ul className="divide-y divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      {fiados.map((f) => (
        <FiadoRow key={f.id} fiado={f} />
      ))}
    </ul>
  )
}
