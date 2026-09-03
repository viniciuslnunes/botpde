import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import { calcularPrevisaoConsumoBar, previsaoBarComRuptura } from '@torcida/types'
import { ADMIN_DIRECAO_TTL, tagAdminDirecao } from '@/lib/admin-direcao-cache'
import { dayKeyInZone } from '@/lib/format-datetime'

export type BarPrevisaoResumo = {
  proximaPartida: { id: string; adversario: string; dataHora: Date } | null
  itens: ReturnType<typeof calcularPrevisaoConsumoBar>
  ruptura: ReturnType<typeof previsaoBarComRuptura>
  jogosBase: number
}

async function fetchPrevisaoBar(tenantId: string, sedeId?: string): Promise<BarPrevisaoResumo> {
  const agora = new Date()
  const proximaPartida: {
    id: string
    adversario: string
    dataHora: Date
  } | null = await db.partida.findFirst({
    where: {
      dataHora: { gte: agora },
      eventos: { some: { tenantId } },
    },
    orderBy: { dataHora: 'asc' },
    select: { id: true, adversario: true, dataHora: true },
  })

  const eventosJogo: Array<{ id: string; data: Date; sedeId: string | null }> = await db.evento.findMany({
    where: {
      tenantId,
      partidaId: { not: null },
      data: { lt: agora },
      ...(sedeId ? { sedeId } : {}),
    },
    orderBy: { data: 'desc' },
    take: 5,
    select: { id: true, data: true, sedeId: true },
  })

  if (eventosJogo.length === 0) {
    return { proximaPartida, itens: [], ruptura: [], jogosBase: 0 }
  }

  /** @type {Array<{ produtoId: string, nome: string, quantidade: number, eventoId: string }>} */
  const linhas = []

  for (const ev of eventosJogo) {
    const dia = dayKeyInZone(ev.data)
    const inicio = new Date(`${dia}T00:00:00-03:00`)
    const fim = new Date(`${dia}T23:59:59-03:00`)

    const itensVenda: Array<{
      quantidade: number
      produto: { id: string; nome: string } | null
      produtoNome: string
    }> = await db.barVendaItem.findMany({
      where: {
        venda: {
          tenantId,
          status: { in: ['PAGA', 'EM_COMANDA'] },
          criadoEm: { gte: inicio, lte: fim },
          ...(ev.sedeId ? { sedeId: ev.sedeId } : sedeId ? { sedeId } : {}),
        },
      },
      select: {
        quantidade: true,
        produtoNome: true,
        produto: { select: { id: true, nome: true } },
      },
    })

    for (const row of itensVenda) {
      const produtoId = row.produto?.id ?? `nome:${row.produtoNome}`
      linhas.push({
        produtoId,
        nome: row.produto?.nome ?? row.produtoNome,
        quantidade: row.quantidade,
        eventoId: ev.id,
      })
    }
  }

  const itens = calcularPrevisaoConsumoBar(linhas, 3)
  const produtoIds = itens.map((i) => i.produtoId).filter((id) => !id.startsWith('nome:'))

  const estoque: Array<{ id: string; estoque: number; estoqueMinimo: number | null }> =
    produtoIds.length === 0
      ? []
      : await db.barProduto.findMany({
          where: { tenantId, id: { in: produtoIds }, ativo: true },
          select: { id: true, estoque: true, estoqueMinimo: true },
        })

  const ruptura = previsaoBarComRuptura(
    itens.filter((i) => !i.produtoId.startsWith('nome:')),
    estoque.map((p) => ({
      produtoId: p.id,
      estoque: p.estoque,
      estoqueMinimo: p.estoqueMinimo,
    })),
  )

  return {
    proximaPartida,
    itens: itens.slice(0, 12),
    ruptura: ruptura.slice(0, 8),
    jogosBase: eventosJogo.length,
  }
}

export const carregarPrevisaoBar = cache(async function carregarPrevisaoBar(
  tenantId: string,
  sedeId?: string,
): Promise<BarPrevisaoResumo> {
  return unstable_cache(
    () => fetchPrevisaoBar(tenantId, sedeId),
    ['admin-bar-previsao', tenantId, sedeId ?? 'all'],
    { revalidate: ADMIN_DIRECAO_TTL, tags: [tagAdminDirecao(tenantId)] },
  )()
})
