import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import {
  ADMIN_DIRECAO_TTL,
  tagAdminDirecao,
} from '@/lib/admin-direcao-cache'
import { slaLabel, type AdminInboxItem } from '@/lib/admin-inbox'

export type LojaRuptura = {
  id: string
  nome: string
  href: string
}

export type LojaOpsResumo = {
  pedidosPendentes: number
  ticketsAbertos: number
  rupturas: LojaRuptura[]
  pendencias: AdminInboxItem[]
}

function somaEstoque(estoque: unknown): number | null {
  if (!estoque || typeof estoque !== 'object') return null
  const e = estoque as Record<string, unknown>
  const vals = Object.values(e).filter((v): v is number => typeof v === 'number')
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0)
}

async function fetchDirecaoLoja(tenantId: string): Promise<LojaOpsResumo> {
  const agora = new Date()
  type ProdutoRow = { id: string; nome: string; estoque: unknown }
  type PedidoLite = {
    id: string
    total: { toNumber(): number } | number
    user: { nome: string | null; email: string }
    criadoEm: Date
  }

  const [pedidosPendentes, ticketsAbertos, pedidosTop, produtos]: [
    number,
    number,
    PedidoLite[],
    ProdutoRow[],
  ] = await Promise.all([
    db.saasPedido.count({ where: { tenantId, status: 'PENDENTE' } }),
    db.saasPedidoTicket.count({
      where: { tenantId, status: { in: ['ABERTO', 'ATENDENDO'] } },
    }),
    db.saasPedido.findMany({
      where: { tenantId, status: 'PENDENTE' },
      orderBy: { criadoEm: 'asc' },
      take: 6,
      select: {
        id: true,
        total: true,
        criadoEm: true,
        user: { select: { nome: true, email: true } },
      },
    }),
    db.saasProduto.findMany({
      where: { tenantId, ativo: true },
      select: { id: true, nome: true, estoque: true },
      take: 80,
      orderBy: { atualizadoEm: 'desc' },
    }),
  ])

  const rupturas: LojaRuptura[] = []
  for (const p of produtos) {
    const total = somaEstoque(p.estoque)
    if (total === 0) {
      rupturas.push({
        id: p.id,
        nome: p.nome,
        href: `/admin/loja/${p.id}`,
      })
    }
    if (rupturas.length >= 8) break
  }

  const pendencias: AdminInboxItem[] = []

  for (const ped of pedidosTop) {
    const nome = ped.user.nome?.trim() || ped.user.email
    const valor =
      typeof ped.total === 'number' ? ped.total : ped.total.toNumber()
    pendencias.push({
      id: `ped-${ped.id}`,
      titulo: `Pedido de ${nome}`,
      detalhe: `R$ ${valor.toFixed(2).replace('.', ',')} · aguardando confirmação`,
      href: '/admin/loja/pedidos?status=PENDENTE',
      tom: 'warning',
      sla: slaLabel(ped.criadoEm, { agora, modo: 'idade' }),
      acao: { tipo: 'confirmar_pedido', pedidoId: ped.id, label: 'Confirmar' },
    })
  }

  if (pedidosPendentes > pedidosTop.length) {
    pendencias.push({
      id: 'pedidos-mais',
      titulo: `+${pedidosPendentes - pedidosTop.length} pedido${pedidosPendentes - pedidosTop.length === 1 ? '' : 's'} na fila`,
      detalhe: 'Ver lista completa de pedidos pendentes.',
      href: '/admin/loja/pedidos?status=PENDENTE',
      tom: pedidosPendentes >= 5 ? 'danger' : 'warning',
    })
  }

  if (ticketsAbertos > 0) {
    pendencias.push({
      id: 'tickets-abertos',
      titulo: `${ticketsAbertos} ticket${ticketsAbertos === 1 ? '' : 's'} aberto${ticketsAbertos === 1 ? '' : 's'}`,
      detalhe: 'Atendimento de pedido ainda em andamento.',
      href: '/admin/loja/atendimento',
      tom: 'warning',
    })
  }

  if (rupturas.length > 0) {
    pendencias.push({
      id: 'rupturas',
      titulo: `${rupturas.length}+ produto${rupturas.length === 1 ? '' : 's'} sem estoque`,
      detalhe: rupturas
        .slice(0, 3)
        .map((r) => r.nome)
        .join(', '),
      href: rupturas[0]?.href ?? '/admin/loja/produtos',
      tom: 'danger',
    })
  }

  return {
    pedidosPendentes,
    ticketsAbertos,
    rupturas,
    pendencias: pendencias.slice(0, 12),
  }
}

/**
 * Inbox da loja — pedidos, tickets e ruptura (scan limitado; sem catálogo).
 */
export const carregarDirecaoLoja = cache(async function carregarDirecaoLoja(
  tenantId: string,
): Promise<LojaOpsResumo> {
  return unstable_cache(
    () => fetchDirecaoLoja(tenantId),
    ['admin-direcao-loja', tenantId],
    { revalidate: ADMIN_DIRECAO_TTL, tags: [tagAdminDirecao(tenantId)] },
  )()
})
