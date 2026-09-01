'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { Package } from 'lucide-react'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { staggerContainer, staggerItem, springSnappy } from '@/lib/motion-presets'

export interface PedidoListItem {
  id: string
  status: string
  statusLabel: string
  statusClass: string
  titulo: string
  totalLabel: string
  meta: string
  itens: { id: string; label: string }[]
  imagemUrl: string | null
  lojaNome: string
  conversaId: string | null
  ticketStatus: string | null
}

interface LojaPedidosListProps {
  ativos: PedidoListItem[]
  historico: PedidoListItem[]
}

function PedidoCard({ pedido }: { pedido: PedidoListItem }) {
  return (
    <m.div
      variants={staggerItem}
      layout
      whileTap={{ scale: 0.995 }}
      transition={springSnappy}
      className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
    >
      <div className="flex items-start gap-4">
        <ProdutoImagem src={pedido.imagemUrl} alt={pedido.titulo} variant="thumb" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold">{pedido.titulo}</h3>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${pedido.statusClass}`}>
              {pedido.statusLabel}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">{pedido.lojaNome}</p>
          <ul className="mt-2 space-y-1 text-sm text-[rgb(var(--foreground-muted))]">
            {pedido.itens.map((item) => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
          <p className="mt-2 font-semibold text-[rgb(var(--foreground))]">{pedido.totalLabel}</p>
          <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">{pedido.meta}</p>
          {pedido.conversaId && (
            <Link
              href={`/portal/mensagens?c=${pedido.conversaId}`}
              className="mt-3 inline-flex text-sm font-medium text-[rgb(var(--primary))] hover:underline"
            >
              {pedido.ticketStatus === 'FECHADO'
                ? 'Ver conversa do pedido'
                : 'Conversar sobre o pedido'}
            </Link>
          )}
        </div>
      </div>
    </m.div>
  )
}

export function LojaPedidosList({ ativos, historico }: LojaPedidosListProps) {
  const vazio = ativos.length === 0 && historico.length === 0

  if (vazio) {
    return (
      <MotionEmptyState
        icon={<Package className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
        title="Nenhum pedido ainda"
        description={
          <Link href="/portal/loja" className="mt-4 inline-block rounded-xl bg-[rgb(var(--primary))] px-4 py-2 text-sm text-primary-on">
            Ir à loja
          </Link>
        }
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16 text-center"
      />
    )
  }

  return (
    <>
      {ativos.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase text-[rgb(var(--foreground-muted))]">
            Em andamento ({ativos.length})
          </h2>
          <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
            {ativos.map((p) => (
              <PedidoCard key={p.id} pedido={p} />
            ))}
          </m.div>
        </section>
      )}
      {historico.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase text-[rgb(var(--foreground-muted))]">
            Histórico ({historico.length})
          </h2>
          <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
            {historico.map((p) => (
              <PedidoCard key={p.id} pedido={p} />
            ))}
          </m.div>
        </section>
      )}
    </>
  )
}
