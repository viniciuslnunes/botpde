import { db } from '@torcida/db'
import { getAlliedTenantIds, tenantsAreAllied } from './hierarquia'

interface PerfilMembroLite {
  id: string
  userId: string
  tenantId: string
  bio: string | null
  perfilPrivado: boolean
  avatarUrl: string | null
}

type SeguimentoStatus = 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'BLOQUEADO'

export async function getOrCreatePerfilMembro(
  userId: string,
  tenantId: string,
): Promise<PerfilMembroLite> {
  const perfil: PerfilMembroLite = await db.perfilMembro.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    create: { userId, tenantId },
    update: {},
    select: {
      id: true,
      userId: true,
      tenantId: true,
      bio: true,
      perfilPrivado: true,
      avatarUrl: true,
    },
  })
  return perfil
}

export async function canFollowUser(
  seguidorId: string,
  seguidoId: string,
  tenantContextoId: string,
): Promise<boolean> {
  if (seguidorId === seguidoId) return false

  const [aliadosContexto, vinculos] = await Promise.all([
    getAlliedTenantIds(tenantContextoId),
    db.saasMembro.findMany({
      where: {
        status: 'APROVADO',
        userId: { in: [seguidorId, seguidoId] },
      },
      select: { userId: true, tenantId: true },
    }) as Promise<{ userId: string; tenantId: string }[]>,
  ])

  const visiveisNoContexto = new Set([tenantContextoId, ...aliadosContexto])
  const seguidorTenants = vinculos
    .filter((v) => v.userId === seguidorId && visiveisNoContexto.has(v.tenantId))
    .map((v) => v.tenantId)
  const seguidoTenants = vinculos
    .filter((v) => v.userId === seguidoId && visiveisNoContexto.has(v.tenantId))
    .map((v) => v.tenantId)

  if (seguidorTenants.length === 0 || seguidoTenants.length === 0) return false

  const seguidorSet = new Set(seguidorTenants)
  for (const tenantId of seguidoTenants) {
    if (seguidorSet.has(tenantId)) return true
  }

  for (const tenantSeguidor of seguidorTenants) {
    for (const tenantSeguido of seguidoTenants) {
      if (await tenantsAreAllied(tenantSeguidor, tenantSeguido)) return true
    }
  }

  return false
}

export async function getSeguimentoStatus(
  seguidorId: string,
  seguidoId: string,
): Promise<SeguimentoStatus | null> {
  const seguimento: { status: SeguimentoStatus } | null = await db.seguimento.findUnique({
    where: { seguidorId_seguidoId: { seguidorId, seguidoId } },
    select: { status: true },
  })
  return seguimento?.status ?? null
}
