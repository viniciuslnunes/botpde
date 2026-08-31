import { db } from '@torcida/db'
import { tenantsAreRivais } from '@/lib/hierarquia'

export type AlertasRecrutamentoCrossTenant = {
  userIdsComRivalSocio: Set<string>
  reprovacoesRivalPorUser: Map<string, number>
}

const VAZIO: AlertasRecrutamentoCrossTenant = {
  userIdsComRivalSocio: new Set(),
  reprovacoesRivalPorUser: new Map(),
}

/**
 * Alertas de recrutamento que atravessam torcida. Só rivais: rejeição ou
 * vínculo em clube não-rival é dado de outro controlador (LGPD) e não entra
 * no card. O cliente só recebe booleano/contagem — nunca o nome da outra
 * torcida.
 */
export async function alertasRecrutamentoCrossTenant(
  viewerTenantId: string,
  userIds: string[],
): Promise<AlertasRecrutamentoCrossTenant> {
  if (userIds.length === 0) return VAZIO

  const [sociosOutros, reprovacoesOutros]: [
    { userId: string; tenantId: string }[],
    { userId: string; tenantId: string }[],
  ] = await Promise.all([
    db.saasMembro.findMany({
      where: {
        userId: { in: userIds },
        status: 'APROVADO',
        tipo: 'SOCIO',
        tenantId: { not: viewerTenantId },
      },
      select: { userId: true, tenantId: true },
    }),
    db.saasMembro.findMany({
      where: {
        userId: { in: userIds },
        status: 'REPROVADO',
        tipo: 'SOCIO',
        tenantId: { not: viewerTenantId },
      },
      select: { userId: true, tenantId: true },
    }),
  ])

  const outrosTenantIds = [
    ...new Set([
      ...sociosOutros.map((s) => s.tenantId),
      ...reprovacoesOutros.map((s) => s.tenantId),
    ]),
  ]
  if (outrosTenantIds.length === 0) return VAZIO

  const checagens = await Promise.all(
    outrosTenantIds.map(
      async (id) => [id, await tenantsAreRivais(viewerTenantId, id)] as const,
    ),
  )
  const rivais = new Set(checagens.filter(([, rival]) => rival).map(([id]) => id))

  const userIdsComRivalSocio = new Set(
    sociosOutros.filter((s) => rivais.has(s.tenantId)).map((s) => s.userId),
  )
  const reprovacoesRivalPorUser = new Map<string, number>()
  for (const r of reprovacoesOutros) {
    if (!rivais.has(r.tenantId)) continue
    reprovacoesRivalPorUser.set(r.userId, (reprovacoesRivalPorUser.get(r.userId) ?? 0) + 1)
  }

  return { userIdsComRivalSocio, reprovacoesRivalPorUser }
}
