'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { Package } from 'lucide-react'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { StatusPedidoSelect } from '@/components/admin/produto-forms'
import { StatusBadge, TableShell } from '@/components/admin/ui'
import { springSnappy } from '@/lib/motion-presets'

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
  return (
    <TableShell
      isEmpty={pedidos.length === 0}
      empty={{
        icon: <Package className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />,
        title: 'Nenhum pedido encontrado',
      }}
    >
      <thead>
        <tr className="border-b border-[rgb(var(--border))] text-left text-xs uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          <th className="px-4 py-3 font-semibold">Pedido</th>
          <th className="px-4 py-3 font-semibold">Itens</th>
          <th className="px-4 py-3 text-right font-semibold">Total</th>
          <th className="px-4 py-3 font-semibold">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[rgb(var(--border))]">
        {pedidos.map((pedido) => (
          <tr key={pedido.id} className="align-top">
            <td className="px-4 py-3">
              <p className="font-medium text-[rgb(var(--foreground))]">{pedido.clienteNome}</p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">{pedido.criadoEmLabel}</p>
              <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">{pedido.meta}</p>
            </td>
            <td className="px-4 py-3">
              <ul className="space-y-2 text-sm">
                {pedido.itens.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <ProdutoImagem src={item.imagemUrl} alt="" variant="mini" />
                    <span className="min-w-0 truncate">{item.label}</span>
                    <span className="ml-auto shrink-0 font-medium tabular-nums">
                      {item.totalLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </td>
            <td className="px-4 py-3 text-right">
              {pedido.subtotalRiscado && (
                <p className="text-xs text-[rgb(var(--color-success-fg))] line-through">
                  {pedido.subtotalRiscado}
                </p>
              )}
              <p className="font-semibold tabular-nums text-[rgb(var(--foreground))]">
                {pedido.totalLabel}
              </p>
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-col items-start gap-2">
                <StatusBadge dominio="pedido" status={pedido.status} />
                <StatusPedidoSelect id={pedido.id} statusAtual={pedido.status} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </TableShell>
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
