import { db } from '@torcida/db'

/**
 * Áreas já **em vigor** por usuário num tenant — o espelho de leitura do que
 * `aplicarDepartamentoPreferido` grava. Ele prefere o `Role` de área (papel
 * MEMBRO) e cai em `UserDepartamento` quando a torcida não tem esse Role, então
 * checar só um dos dois daria falso "pendente" em metade das torcidas.
 *
 * Server-only (Prisma). Helper de UI: `areaPendenteDeEfetivacao`.
 */
export async function getAreasEfetivadasPorUser(
  tenantId: string,
  userIds: string[],
): Promise<Map<string, Set<string>>> {
  const unicos = [...new Set(userIds)].filter(Boolean)
  if (unicos.length === 0) return new Map()

  const [memberships, perfisDeArea]: [
    Array<{ userId: string; departamentoId: string }>,
    Array<{ userId: string; role: { departamentoId: string | null } }>,
  ] = await Promise.all([
    db.userDepartamento.findMany({
      where: { tenantId, userId: { in: unicos } },
      select: { userId: true, departamentoId: true },
    }),
    db.userRole.findMany({
      where: { tenantId, userId: { in: unicos }, role: { departamentoId: { not: null } } },
      select: { userId: true, role: { select: { departamentoId: true } } },
    }),
  ])

  const mapa = new Map<string, Set<string>>()
  const registrar = (userId: string, departamentoId: string | null) => {
    if (!departamentoId) return
    const atual = mapa.get(userId) ?? new Set<string>()
    atual.add(departamentoId)
    mapa.set(userId, atual)
  }

  for (const m of memberships) registrar(m.userId, m.departamentoId)
  for (const p of perfisDeArea) registrar(p.userId, p.role.departamentoId)

  return mapa
}
