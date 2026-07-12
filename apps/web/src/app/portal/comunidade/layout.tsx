import { auth } from '@/lib/auth'
import { ComunidadeDock } from './_components/comunidade-dock'

/**
 * Layout da Comunidade: hospeda o dock flutuante do mobile em todas as
 * subpáginas (feed, perfil, vídeos, grupos…) e garante o espaço inferior
 * para que o conteúdo nunca fique escondido atrás dele.
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

  return (
    <div className="pb-24 lg:pb-0">
      {children}
      {currentUser.id && <ComunidadeDock currentUser={currentUser} />}
    </div>
  )
}
