'use client'

import type { ReactNode } from 'react'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { StatusPedidoSelect } from '@/components/admin/produto-forms'
import { StatusBadge, TableShell } from '@/components/admin/ui'
import {
  AdminPedidoTicketActions,
  type PedidoTicketUi,
} from './admin-pedido-ticket-actions'

export interface AdminPedidoListItem {
  id: string
  clienteNome: string
  criadoEmLabel: string
  meta: string
  status: string
  totalLabel: string
  subtotalRiscado: string | null
  itens: { id: string; imagemUrl: string | null; label: string; totalLabel: string }[]
  ticket: PedidoTicketUi | null
}

interface AdminPedidosListProps {
  pedidos: AdminPedidoListItem[]
  /** `<th>` montados no servidor (`ListagemTh`). */
  cabecalho: ReactNode
  podeGerir: boolean
}

export function AdminPedidosList({ pedidos, cabecalho, podeGerir }: AdminPedidosListProps) {
  return (
    <TableShell
      isEmpty={false}
      empty={{ title: 'Nenhum pedido encontrado' }}
    >
      <thead>
        <tr className="border-b border-[rgb(var(--border))] text-left text-xs uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          {cabecalho}
        </tr>
      </thead>
      <tbody className="divide-y divide-[rgb(var(--border))]">
        {pedidos.map((pedido) => (
          <tr key={pedido.id} className="align-top">
            <td className="px-4 py-3">
              <p className="font-medium text-[rgb(var(--foreground))]">{pedido.clienteNome}</p>
              <p className="text-xs text-[rgb(var(--foreground-muted))] lg:hidden">
                {pedido.criadoEmLabel}
              </p>
              <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">{pedido.meta}</p>
            </td>
            <td className="hidden px-4 py-3 sm:table-cell">
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
            <td className="px-4 py-3">
              <AdminPedidoTicketActions ticket={pedido.ticket} podeGerir={podeGerir} />
            </td>
            <td className="hidden px-4 py-3 text-sm text-[rgb(var(--foreground-muted))] lg:table-cell">
              {pedido.criadoEmLabel}
            </td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  )
}
