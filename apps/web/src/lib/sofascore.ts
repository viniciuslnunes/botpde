/**
 * Utilitários Sofascore (widgets oficiais via iframe). Degrada sem config —
 * seção some quando não há embed cadastrado para o clube.
 * Cadastro de embeds: `packages/types/src/sofascore-widgets.js`.
 */

import { cache } from 'react'
import { db } from '@torcida/db'

/** Tipo de widget suportado (espelha WIDGET_TIPOS de @torcida/types). */
export type SofascoreWidgetTipo =
  | 'fixtures'
  | 'standings'
  | 'topPlayers'
  | 'powerRankings'
  | 'player'
  | 'cupTree'

/** Contexto de exibição (espelha WIDGET_CONTEXTOS de @torcida/types). */
export type SofascoreWidgetContexto = 'home' | 'clube' | 'campeonato' | 'jogador' | 'artigo'

export function isEmbedConfigured(embedSrc: string | null | undefined): boolean {
  return Boolean(embedSrc?.trim())
}

/** Altura padrão do iframe quando o widget não informa `alturaPx` no cadastro. */
export const SOFASCORE_ALTURA_PADRAO_PX = 420

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
