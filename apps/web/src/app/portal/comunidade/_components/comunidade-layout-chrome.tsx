'use client'

import { useShellDeFeed } from './comunidade-shell-rotas'

/**
 * Chrome do layout: children + rail (salas / canais sugeridos / chat) no feed
 * e no canal (mesmo shell visual). Fora dessas rotas o rail fica
 * `display:none` mas montado — evita novo `GET /api/conversas/resumo` ao voltar.
 *
 * O rail entra como slot (server component em Suspense). A grade
 * `minmax(0,1fr)_20rem` é o contrato visual de produção — a coluna direita
 * fica travada em 20rem e não cresce com títulos longos de sala/canal.
 * Classes literais (sem concatenar token) para o Tailwind v4 enxergar o track.
 */
export function ComunidadeLayoutChrome({
  aside,
  children,
}: {
  aside: React.ReactNode
  children: React.ReactNode
}) {
  const noFeed = useShellDeFeed()

  return (
    <div
      className={
        noFeed ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-6' : undefined
      }
    >
      <div className="min-w-0">{children}</div>
      <div
        className={noFeed ? 'hidden min-w-0 xl:block' : 'hidden'}
        aria-hidden={!noFeed}
      >
        {aside}
      </div>
    </div>
  )
}
