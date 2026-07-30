import { auth } from '@/lib/auth'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'
import { ComunidadeDock } from './comunidade-dock'

/** Dock mobile — slot próprio para o layout não esperar o avatar. */
export async function ComunidadeDockSlot() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return null

  const avatarUrl = await getAvatarAtualDoUsuario(userId)

  return (
    <ComunidadeDock
      currentUser={{ id: userId, nome: session.user.name ?? null, avatarUrl }}
    />
  )
}
