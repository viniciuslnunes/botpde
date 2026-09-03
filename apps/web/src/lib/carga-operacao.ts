import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'

/**
 * Carga da operação — o material que saiu para aquele jogo, ensaio ou festa.
 *
 * A custódia com foto já existia (`PatrimonioEmprestimo`), mas era avulsa: o
 * bandeirão saía sem dizer para onde, e no dia seguinte ninguém sabia dizer se
 * voltou. Com o vínculo à operação, "o que vai para domingo" e "voltou tudo?"
 * viram uma leitura só.
 */

export type ItemDaCarga = {
  emprestimoId: string
  itemId: string
  nome: string
  categoria: string
  status: string
  responsavel: string | null
  fotoSaidaUrl: string
  fotoGuardaUrl: string | null
  danoReportado: boolean
  abertoEm: Date
  devolvidoEm: Date | null
}

export type CargaOperacao = {
  itens: ItemDaCarga[]
  emCampo: number
  devolvidos: number
  comDano: number
  /** Nada saiu para esta operação — diferente de tudo devolvido. */
  vazia: boolean
}

export const carregarCargaOperacao = cache(async function carregarCargaOperacao(
  tenantId: string,
  eventoId: string,
): Promise<CargaOperacao> {
  const rows: Array<{
    id: string
    itemId: string
    status: string
    fotoSaidaUrl: string
    fotoGuardaUrl: string | null
    danoReportado: boolean
    abertoEm: Date
    devolvidoEm: Date | null
    item: { nome: string; categoria: string }
    user: { nome: string | null }
  }> = await db.patrimonioEmprestimo.findMany({
    where: { tenantId, eventoId },
    orderBy: [{ status: 'asc' }, { abertoEm: 'asc' }],
    take: 120,
    select: {
      id: true,
      itemId: true,
      status: true,
      fotoSaidaUrl: true,
      fotoGuardaUrl: true,
      danoReportado: true,
      abertoEm: true,
      devolvidoEm: true,
      item: { select: { nome: true, categoria: true } },
      user: { select: { nome: true } },
    },
  })

  const itens: ItemDaCarga[] = rows.map((r) => ({
    emprestimoId: r.id,
    itemId: r.itemId,
    nome: r.item.nome,
    categoria: r.item.categoria,
    status: r.status,
    responsavel: r.user.nome,
    fotoSaidaUrl: r.fotoSaidaUrl,
    fotoGuardaUrl: r.fotoGuardaUrl,
    danoReportado: r.danoReportado,
    abertoEm: r.abertoEm,
    devolvidoEm: r.devolvidoEm,
  }))

  const emCampo = itens.filter((i) => i.status === 'ABERTO').length
  const comDano = itens.filter((i) => i.danoReportado || i.status === 'COM_DANO').length

  return {
    itens,
    emCampo,
    devolvidos: itens.length - emCampo,
    comDano,
    vazia: itens.length === 0,
  }
})

/** Operações passadas com material ainda em campo — pendência de conferência. */
export async function listarCargasNaoDevolvidas(
  tenantId: string,
  opts?: { agora?: Date; limite?: number },
): Promise<Array<{ eventoId: string; titulo: string; data: Date; itens: number }>> {
  const agora = opts?.agora ?? new Date()

  const grupos: Array<{ eventoId: string | null; _count: { _all: number } }> =
    await db.patrimonioEmprestimo.groupBy({
      by: ['eventoId'],
      where: {
        tenantId,
        status: 'ABERTO',
        eventoId: { not: null },
        evento: { data: { lt: agora } },
      },
      _count: { _all: true },
    })

  const ids = grupos.map((g) => g.eventoId).filter((id): id is string => Boolean(id))
  if (ids.length === 0) return []

  const eventos: Array<{ id: string; titulo: string; data: Date }> = await db.evento.findMany({
    where: { tenantId, id: { in: ids } },
    orderBy: { data: 'desc' },
    take: opts?.limite ?? 5,
    select: { id: true, titulo: true, data: true },
  })

  const contagem = new Map(grupos.map((g) => [g.eventoId, g._count._all]))
  return eventos.map((e) => ({
    eventoId: e.id,
    titulo: e.titulo,
    data: e.data,
    itens: contagem.get(e.id) ?? 0,
  }))
}
