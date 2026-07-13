import 'server-only'
import { db } from '@torcida/db'

/** Janela em que o usuário conta como "online" na plataforma. */
export const JANELA_ONLINE_MS = 15 * 60 * 1000

/** Intervalo mínimo entre gravações de ultimoAcessoEm (evita write por request). */
export const PRESENCA_THROTTLE_MS = 5 * 60 * 1000

export function isUsuarioOnline(ultimoAcessoEm: Date | null | undefined, agora = Date.now()): boolean {
  if (!ultimoAcessoEm) return false
  return ultimoAcessoEm.getTime() >= agora - JANELA_ONLINE_MS
}

/**
 * Atualiza ultimoAcessoEm com throttle — fire-and-forget a partir do callback de sessão.
 */
export async function registrarUltimoAcesso(userId: string): Promise<void> {
  const limite = new Date(Date.now() - PRESENCA_THROTTLE_MS)
  await db.user.updateMany({
    where: {
      id: userId,
      OR: [{ ultimoAcessoEm: null }, { ultimoAcessoEm: { lt: limite } }],
    },
    data: { ultimoAcessoEm: new Date() },
  })
}
