/**
 * Busca no acervo da Memória — respeita o mesmo recorte do loader.
 */

import { db, withDbRetry } from '@torcida/db'
import {
  MEMORIA_ESCOPO,
  itemEntraNoEscopoClube,
  type MemoriaEscopo,
} from '@torcida/types'
import { getOrCreateComunidadeNacionalTenant } from '@/lib/comunidade-contexto'
import { getEscopoEventosVisiveis } from '@/lib/eventos'
import { filtrarPostsVisiveis } from '@/lib/feed'
import { getTorcidaLineageTenantIds } from '@/lib/hierarquia'
import { filtrarTenantsRestritos } from '@/lib/isolamento'
import { escopoFeedSemConversa } from '@/lib/grupos-scope'
import { diaIsoDe, trechoPost } from '@/lib/memoria-dia'
import { normalizarTermoBuscaMemoria } from '@/lib/memoria-acervo'
import { idsAliadosComMemoria } from './carregar-memoria'

export type MemoriaBuscaHit = {
  dia: string
  titulo: string
  subtitulo: string
  tipo: 'partida' | 'evento' | 'post' | 'fato'
}

const LIMITE_BUSCA = 24

export async function buscarMemoriaNoEscopo(opts: {
  userId: string
  escopo: MemoriaEscopo
  termo: string
  unidadeId: string
  afiliacaoId: string | null
}): Promise<MemoriaBuscaHit[]> {
  const termo = normalizarTermoBuscaMemoria(opts.termo)
  if (!termo) return []

  if (opts.escopo === MEMORIA_ESCOPO.CLUBE) {
    if (!opts.afiliacaoId) return []
    return buscarClube(opts.userId, opts.afiliacaoId, termo)
  }

  return buscarTorcidaOuUnidade({
    userId: opts.userId,
    escopo: opts.escopo,
    unidadeId: opts.unidadeId,
    afiliacaoId: opts.afiliacaoId,
    termo,
  })
}

type PostBuscaRow = {
  id: string
  conteudo: string
  criadoEm: Date
  tenantId: string
  autorId: string
  visibilidade: 'PUBLICO' | 'TENANT' | 'PRIVADO'
  alcanceNacional?: boolean
}

async function buscarClube(
  userId: string,
  afiliacaoId: string,
  termo: string,
): Promise<MemoriaBuscaHit[]> {
  const sintetico = await getOrCreateComunidadeNacionalTenant(afiliacaoId)
  const [posts, partidas]: [PostBuscaRow[], Array<{ adversario: string; dataHora: Date; competicao: string | null }>] =
    await Promise.all([
      withDbRetry(
        () =>
          db.post.findMany({
            where: {
              oculto: false,
              visibilidade: 'PUBLICO',
              conteudo: { contains: termo, mode: 'insensitive' },
              ...escopoFeedSemConversa,
              OR: [{ tenantId: sintetico.id }, { alcanceNacional: true }],
            },
            select: {
              id: true,
              conteudo: true,
              criadoEm: true,
              tenantId: true,
              autorId: true,
              alcanceNacional: true,
              visibilidade: true,
            },
            orderBy: { criadoEm: 'desc' },
            take: LIMITE_BUSCA,
          }) as Promise<PostBuscaRow[]>,
      ),
      withDbRetry(
        () =>
          db.partida.findMany({
            where: {
              afiliacaoId,
              OR: [
                { adversario: { contains: termo, mode: 'insensitive' } },
                { competicao: { contains: termo, mode: 'insensitive' } },
              ],
            },
            select: { adversario: true, dataHora: true, competicao: true },
            orderBy: { dataHora: 'desc' },
            take: LIMITE_BUSCA,
          }) as Promise<Array<{ adversario: string; dataHora: Date; competicao: string | null }>>,
      ),
    ])

  const postsFiltrados = posts.filter((p) =>
    itemEntraNoEscopoClube({
      alcanceNacional: p.alcanceNacional,
      visibilidade: p.visibilidade as 'PUBLICO',
      tenantSintetico: p.tenantId === sintetico.id,
    }),
  )
  const visiveis = await filtrarPostsVisiveis(userId, postsFiltrados)

  const hits: MemoriaBuscaHit[] = []
  const diasVistos = new Set<string>()

  for (const p of partidas) {
    const dia = diaIsoDe(p.dataHora)
    if (diasVistos.has(dia)) continue
    diasVistos.add(dia)
    hits.push({
      dia,
      titulo: `Jogo × ${p.adversario}`,
      subtitulo: p.competicao ?? 'Partida',
      tipo: 'partida',
    })
  }
  for (const p of visiveis) {
    const dia = diaIsoDe(p.criadoEm)
    if (diasVistos.has(dia)) continue
    diasVistos.add(dia)
    hits.push({
      dia,
      titulo: trechoPost(p.conteudo, 72),
      subtitulo: 'Publicação',
      tipo: 'post',
    })
  }

  return dedupOrdenar(hits).slice(0, LIMITE_BUSCA)
}

async function buscarTorcidaOuUnidade(opts: {
  userId: string
  escopo: typeof MEMORIA_ESCOPO.UNIDADE | typeof MEMORIA_ESCOPO.TORCIDA
  unidadeId: string
  afiliacaoId: string | null
  termo: string
}): Promise<MemoriaBuscaHit[]> {
  const [lineage, aliados, escopoEventos] = await Promise.all([
    getTorcidaLineageTenantIds(opts.unidadeId),
    idsAliadosComMemoria(opts.unidadeId),
    getEscopoEventosVisiveis(opts.unidadeId, opts.userId),
  ])
  const lineageAberta = await filtrarTenantsRestritos(lineage, opts.unidadeId)
  const tenantIds =
    opts.escopo === MEMORIA_ESCOPO.UNIDADE ? [opts.unidadeId] : lineageAberta
  const tenantIdsPosts = [...new Set([...tenantIds, ...aliados])]

  const [posts, eventos, fatos]: [
    PostBuscaRow[],
    Array<{ titulo: string; data: Date; local: string | null }>,
    Array<{ conteudo: string; dia: Date }>,
  ] = await Promise.all([
    tenantIdsPosts.length === 0
      ? Promise.resolve([] as PostBuscaRow[])
      : withDbRetry(
          () =>
            db.post.findMany({
              where: {
                tenantId: { in: tenantIdsPosts },
                oculto: false,
                conteudo: { contains: opts.termo, mode: 'insensitive' },
                ...escopoFeedSemConversa,
                OR: [{ tenantId: opts.unidadeId }, { visibilidade: 'PUBLICO' }],
              },
              select: {
                id: true,
                conteudo: true,
                criadoEm: true,
                tenantId: true,
                autorId: true,
                visibilidade: true,
              },
              orderBy: { criadoEm: 'desc' },
              take: LIMITE_BUSCA,
            }) as Promise<PostBuscaRow[]>,
        ),
    withDbRetry(
      () =>
        db.evento.findMany({
          where:
            opts.escopo === MEMORIA_ESCOPO.UNIDADE
              ? {
                  ...escopoEventos,
                  titulo: { contains: opts.termo, mode: 'insensitive' },
                }
              : {
                  tenantId: { in: tenantIds },
                  titulo: { contains: opts.termo, mode: 'insensitive' },
                },
          select: { titulo: true, data: true, local: true },
          orderBy: { data: 'desc' },
          take: LIMITE_BUSCA,
        }) as Promise<Array<{ titulo: string; data: Date; local: string | null }>>,
    ),
    withDbRetry(
      () =>
        db.memoriaFato.findMany({
          where: {
            status: 'APROVADA',
            conteudo: { contains: opts.termo, mode: 'insensitive' },
            OR: [
              { tenantId: opts.unidadeId },
              {
                tenantId: { in: tenantIdsPosts.filter((id) => id !== opts.unidadeId) },
                visibilidade: 'PUBLICO',
              },
            ],
          },
          select: { conteudo: true, dia: true },
          orderBy: { dia: 'desc' },
          take: LIMITE_BUSCA,
        }) as Promise<Array<{ conteudo: string; dia: Date }>>,
    ),
  ])

  const visiveis = await filtrarPostsVisiveis(opts.userId, posts)
  const hits: MemoriaBuscaHit[] = []
  const diasVistos = new Set<string>()

  for (const e of eventos) {
    const dia = diaIsoDe(e.data)
    if (diasVistos.has(dia)) continue
    diasVistos.add(dia)
    hits.push({
      dia,
      titulo: e.titulo,
      subtitulo: e.local ?? 'Evento',
      tipo: 'evento',
    })
  }
  for (const f of fatos) {
    const dia = diaIsoDe(f.dia)
    if (diasVistos.has(dia)) continue
    diasVistos.add(dia)
    hits.push({
      dia,
      titulo: trechoPost(f.conteudo, 72),
      subtitulo: 'Memória ligada',
      tipo: 'fato',
    })
  }
  for (const p of visiveis) {
    const dia = diaIsoDe(p.criadoEm)
    if (diasVistos.has(dia)) continue
    diasVistos.add(dia)
    hits.push({
      dia,
      titulo: trechoPost(p.conteudo, 72),
      subtitulo: 'Publicação',
      tipo: 'post',
    })
  }

  if (opts.afiliacaoId) {
    const partidas: Array<{ adversario: string; dataHora: Date }> = await withDbRetry(() =>
      db.partida.findMany({
        where: {
          afiliacaoId: opts.afiliacaoId!,
          adversario: { contains: opts.termo, mode: 'insensitive' },
        },
        select: { adversario: true, dataHora: true },
        orderBy: { dataHora: 'desc' },
        take: 8,
      }),
    )
    for (const p of partidas) {
      const dia = diaIsoDe(p.dataHora)
      if (diasVistos.has(dia)) continue
      diasVistos.add(dia)
      hits.push({
        dia,
        titulo: `Jogo × ${p.adversario}`,
        subtitulo: 'Partida',
        tipo: 'partida',
      })
    }
  }

  return dedupOrdenar(hits).slice(0, LIMITE_BUSCA)
}

function dedupOrdenar(hits: MemoriaBuscaHit[]): MemoriaBuscaHit[] {
  const porDia = new Map<string, MemoriaBuscaHit>()
  for (const h of hits) {
    if (!porDia.has(h.dia)) porDia.set(h.dia, h)
  }
  return [...porDia.values()].sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0))
}
