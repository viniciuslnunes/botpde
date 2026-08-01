import 'server-only'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db, withDbRetry } from '@torcida/db'
import type { TipoSalaReuniao } from '@torcida/db'
import { tagSalasAtivas, tagSalasNacionais } from './comunidade-cache'
import { generateInviteSlug } from '@/lib/invite-slug'
import { compactOr, orTenantIdsIn } from '@/lib/prisma-filters'
import { ISOLAMENTO_CACHE_TAG, filtrarTenantsRestritos } from '@/lib/isolamento'

/** Contagem de participantes online (presença ativa), alinhada a `salas-presenca`. */
export const participantesOnlineCountSelect = {
  participantes: { where: { saiuEm: null } },
} as const

export type SalaAtivaListItem = {
  id: string
  tenantId: string
  hostId: string
  titulo: string
  tipo: TipoSalaReuniao
  linkConvite: string
  criadoEm: Date
  eventoId: string | null
  host: { id: string; nome: string | null; avatarUrl: string | null }
  evento: { id: string; titulo: string; data: Date } | null
  _count: { participantes: number }
}

export type SalaDetalhe = {
  id: string
  tenantId: string
  hostId: string
  titulo: string
  tipo: TipoSalaReuniao
  livekitRoomName: string
  linkConvite: string
  encerradaEm: Date | null
  criadoEm: Date
  eventoId: string | null
  host: { id: string; nome: string | null; avatarUrl: string | null }
  evento: { id: string; titulo: string; data: Date } | null
  mensagens: {
    id: string
    conteudo: string
    criadoEm: Date
    editadaEm: Date | null
    destacada: boolean
    autorId: string
    autor: { id: string; nome: string | null; avatarUrl: string | null }
  }[]
  _count: { participantes: number }
}

type CreateSalaInput = {
  tenantId: string
  hostId: string
  titulo: string
  tipo: TipoSalaReuniao
  eventoId?: string
}

export const listSalasAtivas = cache(async function listSalasAtivas(
  tenantId: string,
): Promise<SalaAtivaListItem[]> {
  const salas = await unstable_cache(
    // Leitura idempotente com retry: blips do proxy Railway (P1001) na entrada
    // do feed não devem derrubar o bootstrap da Comunidade.
    async () =>
      withDbRetry(
        () =>
          db.salaReuniao.findMany({
            where: { tenantId, encerradaEm: null },
            include: {
              host: { select: { id: true, nome: true, avatarUrl: true } },
              evento: { select: { id: true, titulo: true, data: true } },
              _count: { select: participantesOnlineCountSelect },
            },
            orderBy: [{ tipo: 'asc' }, { criadoEm: 'desc' }],
          }) as Promise<SalaAtivaListItem[]>,
      ),
    ['salas-ativas', tenantId],
    { revalidate: 15, tags: [tagSalasAtivas(tenantId)] },
  )()

  return salas.map(normalizarDatasSala)
})

function normalizarDatasSala(sala: SalaAtivaListItem): SalaAtivaListItem {
  return {
    ...sala,
    criadoEm: sala.criadoEm instanceof Date ? sala.criadoEm : new Date(sala.criadoEm),
    evento: sala.evento
      ? {
          ...sala.evento,
          data: sala.evento.data instanceof Date ? sala.evento.data : new Date(sala.evento.data),
        }
      : null,
  }
}

/**
 * Salas visíveis na Comunidade Nacional do clube: qualquer sala do tenant
 * sintético (container operacional da CN) + salas `ABERTA` das unidades
 * reais do clube (EVENTO/DM_GRUPO permanecem restritas ao tenant de origem).
 */
export const listSalasNacionais = cache(async function listSalasNacionais(
  afiliacaoId: string,
): Promise<SalaAtivaListItem[]> {
  const tenants: Array<{ id: string; sintetico: boolean }> = await db.tenant.findMany({
    where: { afiliacaoId, ativo: true },
    select: { id: true, sintetico: true },
  })
  const tenantIdsSinteticos = tenants.filter((t) => t.sintetico).map((t) => t.id)
  // R5 — unidade com canal restrito não expõe sala aberta na CN do clube.
  const tenantIdsOficiais = await filtrarTenantsRestritos(
    tenants.filter((t) => !t.sintetico).map((t) => t.id),
  )

  const orSalas = compactOr([
    orTenantIdsIn(tenantIdsSinteticos),
    tenantIdsOficiais.length > 0
      ? { tenantId: { in: tenantIdsOficiais }, tipo: 'ABERTA' as const }
      : null,
  ])
  if (orSalas.length === 0) return []

  const salas = await unstable_cache(
    async () =>
      withDbRetry(
        () =>
          db.salaReuniao.findMany({
            where: {
              encerradaEm: null,
              OR: orSalas,
            },
            include: {
              host: { select: { id: true, nome: true, avatarUrl: true } },
              evento: { select: { id: true, titulo: true, data: true } },
              _count: { select: participantesOnlineCountSelect },
            },
            orderBy: [{ tipo: 'asc' }, { criadoEm: 'desc' }],
          }) as Promise<SalaAtivaListItem[]>,
      ),
    ['salas-nacionais', afiliacaoId],
    { revalidate: 15, tags: [tagSalasNacionais(afiliacaoId), ISOLAMENTO_CACHE_TAG] },
  )()

  return salas.map(normalizarDatasSala)
})

export async function getSalaById(tenantId: string, salaId: string): Promise<SalaDetalhe | null> {
  const sala: SalaDetalhe | null = await (db.salaReuniao.findFirst({
    where: { id: salaId, tenantId },
    include: {
      host: { select: { id: true, nome: true, avatarUrl: true } },
      evento: { select: { id: true, titulo: true, data: true } },
      mensagens: {
        where: { excluidaEm: null },
        include: { autor: { select: { id: true, nome: true, avatarUrl: true } } },
        orderBy: [{ destacada: 'desc' }, { criadoEm: 'desc' }],
        take: 50,
      },
      _count: { select: participantesOnlineCountSelect },
    },
  }) as Promise<SalaDetalhe | null>)

  return sala
}

export async function createSala(input: CreateSalaInput): Promise<SalaAtivaListItem> {
  let slug: string | null = null
  for (let i = 0; i < 5; i++) {
    const candidate = generateInviteSlug()
    const existing = await db.salaReuniao.findUnique({
      where: { linkConvite: candidate },
      select: { id: true },
    })
    if (!existing) {
      slug = candidate
      break
    }
  }

  if (!slug) throw new Error('Não foi possível gerar link da sala.')

  const sala: SalaAtivaListItem = await (db.salaReuniao.create({
    data: {
      tenantId: input.tenantId,
      hostId: input.hostId,
      titulo: input.titulo,
      tipo: input.tipo,
      eventoId: input.eventoId,
      livekitRoomName: `${input.tenantId}:${slug}`,
      linkConvite: slug,
    },
    include: {
      host: { select: { id: true, nome: true, avatarUrl: true } },
      evento: { select: { id: true, titulo: true, data: true } },
      _count: { select: participantesOnlineCountSelect },
    },
  }) as Promise<SalaAtivaListItem>)

  return sala
}

export async function encerrarSala(tenantId: string, salaId: string): Promise<boolean> {
  const result = await db.salaReuniao.updateMany({
    where: { id: salaId, tenantId, encerradaEm: null },
    data: { encerradaEm: new Date() },
  })

  return result.count > 0
}
