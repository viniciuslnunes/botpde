import 'server-only'

/**
 * Resolução server-only do clube do onboarding para widgets Sofascore.
 * Nunca importar deste arquivo a partir de um client component — use
 * `@/lib/sofascore` para os tipos/gates seguros no cliente.
 */

import { cache } from 'react'
import { db } from '@torcida/db'
import type { SerieCampeonato } from '@/lib/onboarding'
import { resolveAfiliacaoComunidadeDoUsuario } from '@/lib/authz'
import { getActiveTenant } from '@/lib/tenant'
import { getAncestorTenantIds } from '@/lib/hierarquia'

export type ClubeClassificacao = {
  id: string
  slug: string
  serie: SerieCampeonato | null
  nome: string
}

/**
 * Resolve `Afiliacao.slug` a partir do `afiliacaoId` já decidido pela página
 * (tenant.afiliacaoId ou perfilTorcedor.afiliacaoId — quem decide é o chamador).
 */
export const resolverAfiliacaoSlugContexto = cache(
  async (afiliacaoId: string | null | undefined): Promise<string | null> => {
    if (!afiliacaoId) return null
    const afiliacao: { slug: string | null } | null = await db.afiliacao.findUnique({
      where: { id: afiliacaoId },
      select: { slug: true },
    })
    return afiliacao?.slug ?? null
  },
)

/**
 * Clube para a página Classificação, em cadeia:
 * 1. `resolveAfiliacaoComunidadeDoUsuario` (perfil ou tenant com membro APROVADO)
 * 2. Se ainda nulo: sobe ancestrais do tenant ativo e pega o primeiro com
 *    `afiliacaoId` (PDE/Subsede herdando o clube da Sede)
 */
export const resolverClubeClassificacao = cache(
  async (userId: string, email?: string | null): Promise<ClubeClassificacao | null> => {
    let afiliacaoId = await resolveAfiliacaoComunidadeDoUsuario(userId, email)

    if (!afiliacaoId) {
      const tenant = await getActiveTenant(userId, email)
      if (tenant?.afiliacaoId) {
        afiliacaoId = tenant.afiliacaoId
      } else if (tenant) {
        const ancestrais = await getAncestorTenantIds(tenant.id)
        if (ancestrais.length > 0) {
          const comClube: { id: string; afiliacaoId: string | null }[] = await db.tenant.findMany({
            where: { id: { in: ancestrais }, afiliacaoId: { not: null } },
            select: { id: true, afiliacaoId: true },
          })
          const porId = new Map(comClube.map((t) => [t.id, t.afiliacaoId]))
          for (const id of ancestrais) {
            const found = porId.get(id)
            if (found) {
              afiliacaoId = found
              break
            }
          }
        }
      }
    }

    if (!afiliacaoId) return null

    const afiliacao: {
      id: string
      slug: string | null
      serie: SerieCampeonato | null
      nome: string
      apelido: string | null
    } | null = await db.afiliacao.findUnique({
      where: { id: afiliacaoId },
      select: { id: true, slug: true, serie: true, nome: true, apelido: true },
    })
    if (!afiliacao?.slug) return null

    return {
      id: afiliacao.id,
      slug: afiliacao.slug,
      serie: afiliacao.serie,
      nome: afiliacao.apelido || afiliacao.nome,
    }
  },
)
