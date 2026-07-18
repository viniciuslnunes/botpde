import { db } from '@torcida/db'
import { nicknameSchema } from '@torcida/types'

export type NicknameDisponivelResult =
  | { ok: true; nickname: string; disponivel: true; proprio?: boolean }
  | { ok: true; nickname: string; disponivel: false; motivo: string }
  | { ok: false; motivo: string }

/**
 * Valida formato e unicidade do @nickname.
 * `excludeUserId` ignora o próprio usuário (edição de perfil / definir-apelido).
 */
export async function checarNicknameDisponivel(
  raw: string,
  excludeUserId?: string | null,
): Promise<NicknameDisponivelResult> {
  const parsed = nicknameSchema.safeParse(raw)
  if (!parsed.success) {
    const motivo =
      parsed.error.issues[0]?.message ?? 'Apelido inválido'
    return { ok: false, motivo }
  }

  const nickname = parsed.data
  const atual = excludeUserId
    ? await db.user.findUnique({
        where: { id: excludeUserId },
        select: { nickname: true },
      })
    : null

  if (atual?.nickname && atual.nickname === nickname) {
    return { ok: true, nickname, disponivel: true, proprio: true }
  }

  const ocupado: { id: string } | null = await db.user.findFirst({
    where: {
      nickname,
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
    select: { id: true },
  })

  if (ocupado) {
    return {
      ok: true,
      nickname,
      disponivel: false,
      motivo: 'Este apelido já está em uso. Escolha outro.',
    }
  }

  return { ok: true, nickname, disponivel: true }
}

/**
 * Tenta gravar o primeiro @ válido e livre da lista (OAuth).
 * Não inventa sufixos numéricos — se o handle natural estiver ocupado, deixa
 * para /definir-apelido (usuário escolhe).
 */
export async function tentarAtribuirNickname(
  userId: string,
  seeds: string[],
): Promise<string | null> {
  for (const seed of seeds) {
    const check = await checarNicknameDisponivel(seed, userId)
    if (!check.ok || !check.disponivel) continue
    try {
      await db.user.update({
        where: { id: userId },
        data: { nickname: check.nickname },
      })
      return check.nickname
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : ''
      // Corrida: outro usuário pegou o @ entre o check e o update.
      if (code === 'P2002') continue
      throw err
    }
  }
  return null
}
