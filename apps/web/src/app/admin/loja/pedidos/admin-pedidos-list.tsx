'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { Package } from 'lucide-react'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { StatusPedidoBadge, StatusPedidoSelect } from '@/components/admin/produto-forms'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

export interface AdminPedidoListItem {
  id: string
  clienteNome: string
  criadoEmLabel: string
  meta: string
  status: string
  totalLabel: string
  subtotalRiscado: string | null
  itens: { id: string; imagemUrl: string | null; label: string; totalLabel: string }[]
}

interface AdminPedidosListProps {
  pedidos: AdminPedidoListItem[]
}

export function AdminPedidosList({ pedidos }: AdminPedidosListProps) {
  if (pedidos.length === 0) {
    return (
      <MotionEmptyState
        icon={<Package className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
        title="Nenhum pedido encontrado"
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16 text-center"
      />
    )
  }

  return (
    <m.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4">
      {pedidos.map((pedido) => (
        <m.div
          key={pedido.id}
          variants={staggerItem}
          layout
          className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 space-y-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">{pedido.clienteNome}</p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">{pedido.criadoEmLabel}</p>
              <p className="text-xs mt-1">{pedido.meta}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPedidoBadge status={pedido.status} />
              <StatusPedidoSelect id={pedido.id} statusAtual={pedido.status} />
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            {pedido.itens.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <ProdutoImagem src={item.imagemUrl} alt="" variant="mini" />
                <span>{item.label}</span>
                <span className="ml-auto font-medium">{item.totalLabel}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t pt-2 text-sm font-semibold">
            <span>Total</span>
            <span>
              {pedido.subtotalRiscado && (
                <span className="mr-2 text-xs font-normal text-emerald-600 line-through">
                  {pedido.subtotalRiscado}
                </span>
              )}
              {pedido.totalLabel}
            </span>
          </div>
        </m.div>
      ))}
    </m.div>
  )
}

interface AdminPedidosFiltrosProps {
  options: { value: string; label: string; count: number; href: string; active: boolean }[]
}

export function AdminPedidosFiltros({ options }: AdminPedidosFiltrosProps) {
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
