import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import {
  bucketSomaPorDia,
  resolverIntervaloPeriodo,
  type Periodo,
  type SerieTemporal,
} from '@/lib/admin-insights'

export type EngajamentoPeriodo = {
  posts: number
  reacoes: number
  comentarios: number
}

export type EngajamentoResumo = {
  atual: EngajamentoPeriodo
  anterior: EngajamentoPeriodo
  /** Posts + reações + comentários por dia no período. */
  interacoesPorDia: SerieTemporal
  denunciasAbertas: number
}

/**
 * Engajamento da comunidade no período vs anterior. `Reacao`/`Comentario` não
 * têm tenantId próprio — o escopo entra pela relação `post: { tenantId }`.
 */
export const resumirEngajamento = cache(async function resumirEngajamento(
  tenantId: string,
  periodo: Periodo,
): Promise<EngajamentoResumo> {
  const { inicio, fim, inicioAnterior, fimAnterior } = resolverIntervaloPeriodo(periodo)

  const contarPeriodo = (de: Date, ate: Date): Promise<[number, number, number]> =>
    Promise.all([
      db.post.count({ where: { tenantId, criadoEm: { gte: de, lte: ate } } }),
      db.reacao.count({
        where: { post: { is: { tenantId } }, criadoEm: { gte: de, lte: ate } },
      }),
      db.comentario.count({
        where: { post: { is: { tenantId } }, oculto: false, criadoEm: { gte: de, lte: ate } },
      }),
    ])

  type DataRow = { criadoEm: Date }
  const [
    [posts, reacoes, comentarios],
    [postsAnt, reacoesAnt, comentariosAnt],
    denunciasAbertas,
    datasPosts,
    datasReacoes,
    datasComentarios,
  ]: [
    [number, number, number],
    [number, number, number],
    number,
    DataRow[],
    DataRow[],
    DataRow[],
  ] = await Promise.all([
    contarPeriodo(inicio, fim),
    contarPeriodo(inicioAnterior, fimAnterior),
    db.denuncia.count({ where: { tenantId, status: 'PENDENTE' } }),
    db.post.findMany({
      where: { tenantId, criadoEm: { gte: inicio, lte: fim } },
      select: { criadoEm: true },
    }),
    db.reacao.findMany({
      where: { post: { is: { tenantId } }, criadoEm: { gte: inicio, lte: fim } },
      select: { criadoEm: true },
    }),
    db.comentario.findMany({
      where: { post: { is: { tenantId } }, oculto: false, criadoEm: { gte: inicio, lte: fim } },
      select: { criadoEm: true },
    }),
  ])

  const interacoesPorDia = bucketSomaPorDia(
    [...datasPosts, ...datasReacoes, ...datasComentarios].map((r) => ({
      data: r.criadoEm,
      valor: 1,
    })),
    inicio,
    fim,
  )

  return {
    atual: { posts, reacoes, comentarios },
    anterior: { posts: postsAnt, reacoes: reacoesAnt, comentarios: comentariosAnt },
    interacoesPorDia,
    denunciasAbertas,
  }
})

export type LeituraComunicado = {
  titulo: string
  leituras: number
  /** leituras / membros aprovados — null sem base. */
  taxa: number | null
}

export type LeituraComunicadosResumo = {
  /** Denominador do read-rate: membros APROVADOS do tenant. */
  membrosBase: number
  comunicados: LeituraComunicado[]
  /** Média das taxas dos comunicados listados — null sem comunicados/base. */
  taxaMedia: number | null
}

function encurtar(titulo: string): string {
  return titulo.length > 28 ? `${titulo.slice(0, 27)}…` : titulo
}

/** Read-rate dos últimos comunicados oficiais (leituras ÷ membros aprovados). */
export const resumirLeituraComunicados = cache(async function resumirLeituraComunicados(
  tenantId: string,
  limite = 5,
): Promise<LeituraComunicadosResumo> {
  type ComunicadoRow = { titulo: string; _count: { leituras: number } }
  const [membrosBase, comunicados]: [number, ComunicadoRow[]] = await Promise.all([
    db.saasMembro.count({ where: { tenantId, status: 'APROVADO' } }),
    db.announcement.findMany({
      where: { tenantId },
      orderBy: { publicadoEm: 'desc' },
      take: limite,
      select: { titulo: true, _count: { select: { leituras: true } } },
    }),
  ])

  const lista: LeituraComunicado[] = comunicados.map((c) => ({
    titulo: encurtar(c.titulo),
    leituras: c._count.leituras,
    taxa: membrosBase > 0 ? c._count.leituras / membrosBase : null,
  }))

  const taxas = lista.flatMap((c) => (c.taxa !== null ? [c.taxa] : []))
  return {
    membrosBase,
    comunicados: lista,
    taxaMedia: taxas.length > 0 ? taxas.reduce((acc, t) => acc + t, 0) / taxas.length : null,
  }
})
