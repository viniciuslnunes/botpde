/**
 * Distingue área **pretendida** (preferência do onboarding, ainda sem efeito)
 * de área **em vigor** — cada nível da hierarquia efetiva a sua: ver
 * `efetivarAreaPretendida`.
 *
 * Módulo puro (sem Prisma) — importável em client components via
 * `admin-membro-map`. A query fica em `get-areas-efetivadas.ts`.
 */

/** A área pretendida neste tenant ainda não entrou em vigor? */
export function areaPendenteDeEfetivacao(
  departamentoId: string | null | undefined,
  efetivadas: Set<string> | undefined,
): boolean {
  if (!departamentoId) return false
  return !efetivadas?.has(departamentoId)
}
