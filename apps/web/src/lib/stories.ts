import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import { getVisibleTenantIds } from './hierarquia'
import { tagStoriesRings } from './comunidade-cache'
import { getAutoresSemAcesso, resolverAvatarSocial } from './perfil-social'

const STORY_TTL_MS = 24 * 60 * 60 * 1000

export interface MomentoStoryItem {
  id: string
  userId: string
  midiaUrl: string
  conteudo: string | null
  criadoEm: string
  expiraEm: string
}

export interface StoryRingItem {
  userId: string
  nome: string | null
  avatarUrl: string | null
  momentos: MomentoStoryItem[]
  temNovo: boolean
}

interface StoryRowCached {
  id: string
  userId: string
  midiaUrl: string
  conteudo: string | null
  criadoEm: string
  expiraEm: string
  user: { id: string; nome: string | null; avatarUrl: string | null }
}

export function calcularExpiraStory(criadoEm = new Date()): Date {
  return new Date(criadoEm.getTime() + STORY_TTL_MS)
}

export const getMomentosStoryDoAutor = cache(async function getMomentosStoryDoAutor(
  userId: string,
  tenantId: string,
): Promise<MomentoStoryItem[]> {
  const agora = new Date()
  const rows: Array<{
    id: string
    userId: string
    midiaUrl: string
    conteudo: string | null
    criadoEm: Date
    expiraEm: Date
  }> = await db.momentoStory.findMany({
    where: { userId, tenantId, expiraEm: { gt: agora } },
    orderBy: { criadoEm: 'asc' },
    select: {
      id: true,
      userId: true,
      midiaUrl: true,
      conteudo: true,
      criadoEm: true,
      expiraEm: true,
    },
  })
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    midiaUrl: row.midiaUrl,
    conteudo: row.conteudo,
    criadoEm: row.criadoEm.toISOString(),
    expiraEm: row.expiraEm.toISOString(),
  }))
})

export const getStoryRings = cache(async function getStoryRings(
  tenantId: string,
  viewerId: string,
): Promise<StoryRingItem[]> {
  const visibleTenantIds = await getVisibleTenantIds(tenantId, 'comunidade')
  const visibleTenantIdsKey = [...visibleTenantIds].sort().join(',')
  const rows = await unstable_cache(
    async (): Promise<StoryRowCached[]> => {
      const agora = new Date()
      const raw: Array<{
        id: string
        userId: string
        midiaUrl: string
        conteudo: string | null
        criadoEm: Date
        expiraEm: Date
        user: { id: string; nome: string | null; avatarUrl: string | null }
      }> = await db.momentoStory.findMany({
        where: {
          tenantId: { in: visibleTenantIds },
          expiraEm: { gt: agora },
        },
        orderBy: { criadoEm: 'asc' },
        select: {
          userId: true,
          user: { select: { id: true, nome: true, avatarUrl: true } },
          id: true,
          midiaUrl: true,
          conteudo: true,
          criadoEm: true,
          expiraEm: true,
        },
      })

      return raw.map((row) => ({
        ...row,
        criadoEm: row.criadoEm.toISOString(),
        expiraEm: row.expiraEm.toISOString(),
      }))
    },
    ['stories-rings-base', tenantId, visibleTenantIdsKey],
    { revalidate: 60, tags: [tagStoriesRings(tenantId)] },
  )()

  const porAutor = new Map<string, StoryRingItem>()

  const autorIds = [...new Set(rows.map((r) => r.userId))].filter((id) => id !== viewerId)
  const semAcesso = await getAutoresSemAcesso(viewerId, tenantId, autorIds)

  for (const row of rows) {
    if (row.userId !== viewerId && semAcesso.has(row.userId)) continue

    const momento: MomentoStoryItem = {
      id: row.id,
      userId: row.userId,
      midiaUrl: row.midiaUrl,
      conteudo: row.conteudo,
      criadoEm: row.criadoEm,
      expiraEm: row.expiraEm,
    }

    const existente = porAutor.get(row.userId)
    if (existente) {
      existente.momentos.push(momento)
      if (new Date(momento.criadoEm) > new Date(Date.now() - 6 * 60 * 60 * 1000)) {
        existente.temNovo = true
      }
    } else {
      porAutor.set(row.userId, {
        userId: row.userId,
        nome: row.user.nome,
        avatarUrl: resolverAvatarSocial(row.user.avatarUrl),
        momentos: [momento],
        temNovo: row.userId !== viewerId,
      })
    }
  }

  const rings = [...porAutor.values()]
  rings.sort((a, b) => {
    if (a.userId === viewerId) return -1
    if (b.userId === viewerId) return 1
    if (a.temNovo !== b.temNovo) return a.temNovo ? -1 : 1
    return (new Date(b.momentos[b.momentos.length - 1]?.criadoEm ?? 0).getTime() ?? 0) -
      (new Date(a.momentos[a.momentos.length - 1]?.criadoEm ?? 0).getTime() ?? 0)
  })

  return rings
})
