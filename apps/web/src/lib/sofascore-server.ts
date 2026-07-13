import 'server-only'

/**
 * Resolução server-only do clube do onboarding para widgets Sofascore.
 * Nunca importar deste arquivo a partir de um client component — use
 * `@/lib/sofascore` para os tipos/gates seguros no cliente.
 */

import { cache } from 'react'
import { db } from '@torcida/db'

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
