/**
 * Utilitários Sofascore (widgets oficiais via iframe) seguros para client component.
 * Sem dependência de Prisma/servidor — resolução de `Afiliacao.slug` fica em
 * `@/lib/sofascore-server`. Cadastro de embeds: `packages/types/src/sofascore-widgets.js`.
 */

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
