/**
 * Sticky + scroll próprio das colunas laterais do feed (esq./dir.),
 * independente do scroll do feed central. Barra de scroll oculta
 * (`app-scrollbar-none`) — scroll continua via roda/trackpad/toque.
 *
 * Coluna direita (chrome): 20rem via
 * `xl:grid-cols-[minmax(0,1fr)_20rem]` em `ComunidadeLayoutChrome`.
 * A largura é reservada só lá — `loading.tsx` da rota não deve repetir a
 * coluna, senão o feed fica esmagado.
 */
export const COMUNIDADE_RAIL_SCROLL =
  'app-scrollbar-none sticky top-20 self-start max-h-[calc(100dvh-5.5rem)] space-y-4 overflow-y-auto overscroll-y-contain'
