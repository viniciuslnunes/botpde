import { db } from '@torcida/db'
import { ESCOPOS_RIVALIDADE_ISOLANTE, ordenarPar, saoRivais } from '@torcida/types'
import { getTenantRelation } from './hierarquia'

type VinculoTenant = { userId: string; tenantId: string }

async function vinculosAprovados(userIds: string[]): Promise<VinculoTenant[]> {
  const [membros, cargos]: [VinculoTenant[], VinculoTenant[]] = await Promise.all([
    db.saasMembro.findMany({
      where: { userId: { in: userIds }, status: 'APROVADO', desligadoEm: null },
      select: { userId: true, tenantId: true },
    }),
    db.userRole.findMany({
      where: { userId: { in: userIds }, tenant: { ativo: true, sintetico: false } },
      select: { userId: true, tenantId: true },
    }),
  ])
  const vistos = new Set<string>()
  const out: VinculoTenant[] = []
  for (const v of [...membros, ...cargos]) {
    const key = `${v.userId}:${v.tenantId}`
    if (vistos.has(key)) continue
    vistos.add(key)
    out.push(v)
  }
  return out
}

async function afiliacaoDoUsuario(userId: string): Promise<string | null> {
  const perfil: { afiliacaoId: string | null } | null = await db.perfilTorcedor.findUnique({
    where: { userId },
    select: { afiliacaoId: true },
  })
  if (perfil?.afiliacaoId) return perfil.afiliacaoId

  const membro: { tenant: { afiliacaoId: string | null } } | null = await db.saasMembro.findFirst({
    where: { userId, status: 'APROVADO', desligadoEm: null },
    select: { tenant: { select: { afiliacaoId: true } } },
  })
  return membro?.tenant.afiliacaoId ?? null
}

async function clubesSaoRivais(afiliacaoA: string, afiliacaoB: string): Promise<boolean> {
  if (afiliacaoA === afiliacaoB) return false
  const [a, b] = ordenarPar(afiliacaoA, afiliacaoB)
  // Mesmo filtro de escopo do isolamento de tenant (`hierarquia.ts`): clássico
  // interestadual não some da malha.
  const n: number = await db.rivalidadeClube.count({
    where: { afiliacaoAId: a, afiliacaoBId: b, escopo: { in: [...ESCOPOS_RIVALIDADE_ISOLANTE] } },
  })
  return n > 0
}

/**
 * Qualquer vínculo APROVADO (sócio ou torcedor) + cargo. Rival = inexistente —
 * não só sócio×sócio. Sem vínculo de tenant, cai na rivalidade de clube do perfil.
 */
export async function saoUsuariosRivais(userA: string, userB: string): Promise<boolean> {
  if (userA === userB) return false

  const vinculos = await vinculosAprovados([userA, userB])
  const aV = vinculos.filter((v) => v.userId === userA)
  const bV = vinculos.filter((v) => v.userId === userB)

  if (aV.length > 0 && bV.length > 0) {
    for (const va of aV) {
      for (const vb of bV) {
        if (va.tenantId === vb.tenantId) continue
        const rel = await getTenantRelation(va.tenantId, vb.tenantId)
        if (saoRivais(rel)) return true
      }
    }
    return false
  }

  const [afA, afB]: [string | null, string | null] = await Promise.all([
    afiliacaoDoUsuario(userA),
    afiliacaoDoUsuario(userB),
  ])
  if (!afA || !afB) return false
  return clubesSaoRivais(afA, afB)
}

/**
 * Perfil da comunidade: rival (e clube rival sem vínculo) some como 404.
 * Hierarquia, aliado e mesmo clube (CN / co-irmã) continuam visíveis.
 */
export async function podeVerPerfilComunidade(
  viewerId: string,
  targetUserId: string,
  profileTenantId: string,
  viewerTenantId: string | null,
): Promise<boolean> {
  if (viewerId === targetUserId) return true
  if (await saoUsuariosRivais(viewerId, targetUserId)) return false

  if (viewerTenantId) {
    if (viewerTenantId === profileTenantId) return true
    const rel = await getTenantRelation(viewerTenantId, profileTenantId)
    if (saoRivais(rel)) return false
    if (rel === 'self' || rel === 'ancestor' || rel === 'descendant' || rel === 'allied') {
      return true
    }
  }

  const [afViewer, alvo]: [string | null, { afiliacaoId: string | null } | null] = await Promise.all([
    afiliacaoDoUsuario(viewerId),
    db.tenant.findUnique({
      where: { id: profileTenantId },
      select: { afiliacaoId: true },
    }),
  ])
  const afAlvo = alvo?.afiliacaoId ?? null
  if (afViewer && afAlvo && afViewer === afAlvo) return true
  if (afViewer && afAlvo && (await clubesSaoRivais(afViewer, afAlvo))) return false

  return false
}
