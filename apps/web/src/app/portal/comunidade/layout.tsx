import { auth } from '@/lib/auth'
import { ComunidadeDock } from './_components/comunidade-dock'
import { ComunidadeRouteTransition } from './_components/comunidade-route-transition'
import { ComunidadeLayoutChrome } from './_components/comunidade-layout-chrome'
import { ComunidadeQueryProvider } from '@/components/portal/comunidade-query-provider'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { listSalasAtivas } from '@/lib/salas'
import type { SalaAtivaListItem } from '@/lib/salas'

/**
 * Layout da Comunidade: dock mobile, QueryProvider (cache do feed) e
 * aside de chat/salas persistente no feed (sem remount ao ir/voltar).
 */
export default async function ComunidadeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const currentUser = {
    id: session?.user?.id ?? '',
    nome: session?.user?.name ?? null,
    avatarUrl: session?.user?.image ?? null,
  }

  let modoTorcida = false
  let salas: SalaAtivaListItem[] = []
  if (session?.user?.id) {
    const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
    if (ctx?.modo === 'torcida') {
      modoTorcida = true
      salas = await listSalasAtivas(ctx.tenant.id)
    }
  }

  return (
    <ComunidadeQueryProvider>
      <div className="pb-24 lg:pb-0">
        <ComunidadeLayoutChrome
          currentUserId={currentUser.id}
          salas={salas}
          modoTorcida={modoTorcida}
        >
          <ComunidadeRouteTransition>{children}</ComunidadeRouteTransition>
        </ComunidadeLayoutChrome>
        {currentUser.id && <ComunidadeDock currentUser={currentUser} />}
      </div>
    </ComunidadeQueryProvider>
  )
}
