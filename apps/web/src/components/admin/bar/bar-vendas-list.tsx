'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { ReceiptText } from 'lucide-react'
import { cancelarVendaBar } from '@/app/admin/bar/actions'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import { useConfirmAction } from '@/lib/confirm-action'

export interface BarVendaListItem {
  id: string
  criadoEmLabel: string
  operadorNome: string
  metodoLabel: string
  status: string
  statusLabel: string
  totalLabel: string
  descontoLabel: string | null
  observacao: string | null
  itens: { id: string; label: string; totalLabel: string }[]
}

const STATUS_VENDA_COR: Record<string, string> = {
  PENDENTE: 'bg-[rgb(var(--color-warning)_/_0.14)] text-[rgb(var(--color-warning-fg))]',
  PAGA: 'bg-[rgb(var(--color-success)_/_0.14)] text-[rgb(var(--color-success-fg))]',
  CANCELADA: 'bg-[rgb(var(--color-danger)_/_0.14)] text-[rgb(var(--color-danger-fg))]',
}

export function StatusVendaBarBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_VENDA_COR[status] ?? 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]'}`}
    >
      {label}
    </span>
  )
}

function CancelarVendaBarButton({ venda }: { venda: BarVendaListItem }) {
  const confirmAction = useConfirmAction()

  return (
    <button
      onClick={() =>
        void confirmAction({
          titulo: 'Cancelar esta venda?',
          descricao: `Venda de ${venda.totalLabel} aguardando pagamento. O estoque dos itens será restaurado.`,
          labelConfirmar: 'Cancelar venda',
          labelCancelar: 'Voltar',
          variante: 'destructive',
          cancelled: 'Cancelamento abortado.',
          run: () => cancelarVendaBar(venda.id),
          success: 'Venda cancelada e estoque restaurado.',
        })
      }
      className="rounded-lg border border-[rgb(var(--color-danger)_/_0.35)] px-3 py-1.5 text-xs font-medium text-[rgb(var(--color-danger-fg))] hover:bg-[rgb(var(--color-danger)_/_0.08)]"
    >
      Cancelar
    </button>
  )
}

export function BarVendasList({
  vendas,
  podeGerir,
}: {
  vendas: BarVendaListItem[]
  podeGerir: boolean
}) {
  if (vendas.length === 0) {
    return (
      <MotionEmptyState
        icon={<ReceiptText className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
        title="Nenhuma venda encontrada"
        description="As vendas registradas no PDV aparecem aqui."
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center"
      />
    )
  }

  return (
    <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4">
      {vendas.map((venda) => (
        <m.div
          key={venda.id}
          variants={staggerItem}
          layout
          className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[rgb(var(--foreground))]">{venda.criadoEmLabel}</p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                Operador: {venda.operadorNome} · {venda.metodoLabel}
              </p>
              {venda.observacao && (
                <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">{venda.observacao}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <StatusVendaBarBadge status={venda.status} label={venda.statusLabel} />
              {podeGerir && venda.status === 'PENDENTE' && <CancelarVendaBarButton venda={venda} />}
            </div>
          </div>
          <ul className="space-y-1.5 text-sm">
            {venda.itens.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <span className="text-[rgb(var(--foreground))]">{item.label}</span>
                <span className="ml-auto font-medium">{item.totalLabel}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-[rgb(var(--border))] pt-2 text-sm font-semibold">
            <span>Total</span>
            <span>
              {venda.descontoLabel && (
                <span className="mr-2 text-xs font-normal text-[rgb(var(--foreground-muted))]">
                  desconto {venda.descontoLabel}
                </span>
              )}
              {venda.totalLabel}
            </span>
          </div>
        </m.div>
      ))}
    </m.div>
  )
}

export function BarVendasFiltros({
  options,
}: {
  options: { value: string; label: string; count: number; href: string; active: boolean }[]
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <m.div key={opt.value} whileTap={{ scale: 0.96 }} transition={springSnappy}>
          <Link
            href={opt.href}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
              opt.active
                ? 'border-[rgb(var(--color-primary)_/_0.45)] bg-[rgb(var(--color-primary)_/_0.14)] font-semibold text-[rgb(var(--color-primary-fg))]'
                : 'border-[rgb(var(--border))] font-medium text-[rgb(var(--foreground-muted))]'
            }`}
          >
            {opt.label}
            <span className="rounded-full bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-xs">
              {opt.count}
            </span>
          </Link>
        </m.div>
      ))}
    </div>
  )
}
