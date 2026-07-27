import { db, type Prisma } from '@torcida/db'
import { saoRivais } from '@torcida/types'
import { resolverPerfilPrivadoEfetivo } from './perfil-social'
import { getAlliedTenantIds, getTenantRelation, tenantsAreAllied } from './hierarquia'

interface PerfilMembroLite {
  id: string
  userId: string
  tenantId: string
  bio: string | null
  perfilPrivado: boolean
  avatarUrl: string | null
  bannerUrl: string | null
  bannerPos: number | null
  exibirCidade: boolean
  exibirSede: boolean
  exibirDesde: boolean
}

type SeguimentoStatus = 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'BLOQUEADO'

/** Leitura do perfil social — use em pages/RSC (sem upsert em GET). */
export async function getPerfilMembroForPortal(
  userId: string,
  tenantId: string,
): Promise<Pick<PerfilMembroLite, 'perfilPrivado'>> {
  const [perfil, membro] = await Promise.all([
    db.perfilMembro.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { perfilPrivado: true },
    }),
    db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { tipo: true, status: true },
    }),
  ])
  return {
    perfilPrivado: resolverPerfilPrivadoEfetivo(perfil?.perfilPrivado, membro),
  }
}

/**
 * Privacidade efetiva do ALVO para decidir PENDENTE vs APROVADO ao seguir.
 * Usa o tenant do perfil visitado (mesmo critério da página de perfil) —
 * nunca o tenant/contexto do seguidor (CN de torcedor global quebrava isso).
 * Fail-closed: sem tenant do alvo → exige aprovação.
 */
export async function getPerfilPrivadoEfetivoDoAlvo(
  alvoId: string,
  viewerId: string,
): Promise<{ perfilPrivado: boolean; tenantIdAlvo: string | null }> {
  const { resolvePerfilTenantForUser } = await import('./resolve-perfil-tenant')
  const tenantAlvo = await resolvePerfilTenantForUser(alvoId, viewerId)
  if (!tenantAlvo) return { perfilPrivado: true, tenantIdAlvo: null }
  const { perfilPrivado } = await getPerfilMembroForPortal(alvoId, tenantAlvo.id)
  return { perfilPrivado, tenantIdAlvo: tenantAlvo.id }
}

/** Sócios aprovados entram com perfil privado (torcedores permanecem públicos). */
export async function privatizarPerfilAoAprovarSocio(
  userId: string,
  tenantId: string,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<void> {
  await client.perfilMembro.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    create: { userId, tenantId, perfilPrivado: true },
    update: { perfilPrivado: true },
  })
}

export async function getOrCreatePerfilMembro(
  userId: string,
  tenantId: string,
): Promise<PerfilMembroLite> {
  const membro: { tipo: 'SOCIO' | 'TORCEDOR' } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { tipo: true },
  })
  const perfilPrivadoDefault = membro?.tipo === 'SOCIO'

  const perfil: PerfilMembroLite = await db.perfilMembro.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    create: { userId, tenantId, perfilPrivado: perfilPrivadoDefault },
    update: {},
    select: {
      id: true,
      userId: true,
      tenantId: true,
      bio: true,
      perfilPrivado: true,
      avatarUrl: true,
      bannerUrl: true,
      bannerPos: true,
      exibirCidade: true,
      exibirSede: true,
      exibirDesde: true,
    },
  })
  return perfil
}

/** Torcedor global (sem SaasMembro): as torcidas do clube do PerfilTorcedor. */
async function getTenantsDoClubeDoTorcedor(userId: string): Promise<string[]> {
  const perfil: { afiliacaoId: string | null } | null = await db.perfilTorcedor.findUnique({
    where: { userId },
    select: { afiliacaoId: true },
  })
  if (!perfil?.afiliacaoId) return []
  // Import dinâmico: comunidade-contexto puxa tenant.ts/env — evita acoplar
  // este módulo (usado em testes puros) ao ambiente Next.
  const { getTenantIdsPorAfiliacao } = await import('./comunidade-contexto')
  return getTenantIdsPorAfiliacao(perfil.afiliacaoId)
}

type VinculoMembro = { userId: string; tenantId: string; tipo: 'SOCIO' | 'TORCEDOR' }

async function avaliarCanFollowComDados(
  seguidorId: string,
  seguidoId: string,
  tenantContextoId: string | null,
  aliadosContexto: string[],
  vinculos: VinculoMembro[],
  tenantsClubeCache: Map<string, string[]>,
  relationCache: Map<string, Awaited<ReturnType<typeof getTenantRelation>>>,
): Promise<boolean> {
  if (seguidorId === seguidoId) return false

  const visiveisNoContexto: Set<string> | null = tenantContextoId
    ? new Set([tenantContextoId, ...aliadosContexto])
    : null
  const noContexto = (tenantId: string): boolean =>
    visiveisNoContexto === null || visiveisNoContexto.has(tenantId)

  const seguidorVinculos = vinculos.filter((v) => v.userId === seguidorId && noContexto(v.tenantId))
  const seguidoVinculos = vinculos.filter((v) => v.userId === seguidoId && noContexto(v.tenantId))

  async function tenantsDoUsuario(userId: string, vinculosUsuario: VinculoMembro[]): Promise<string[]> {
    if (vinculosUsuario.length > 0) return vinculosUsuario.map((v) => v.tenantId)
    if (tenantsClubeCache.has(userId)) return tenantsClubeCache.get(userId)!
    const tenants = await getTenantsDoClubeDoTorcedor(userId)
    tenantsClubeCache.set(userId, tenants)
    return tenants
  }

  const [seguidorTenants, seguidoTenants] = await Promise.all([
    tenantsDoUsuario(seguidorId, seguidorVinculos),
    tenantsDoUsuario(seguidoId, seguidoVinculos),
  ])

  if (seguidorTenants.length === 0 || seguidoTenants.length === 0) return false

  for (const vinculoSeguidor of seguidorVinculos) {
    if (vinculoSeguidor.tipo !== 'SOCIO') continue
    for (const vinculoSeguido of seguidoVinculos) {
      if (vinculoSeguido.tipo !== 'SOCIO') continue
      if (vinculoSeguidor.tenantId === vinculoSeguido.tenantId) continue
      const key = [vinculoSeguidor.tenantId, vinculoSeguido.tenantId].sort().join(':')
      if (!relationCache.has(key)) {
        relationCache.set(
          key,
          await getTenantRelation(vinculoSeguidor.tenantId, vinculoSeguido.tenantId),
        )
      }
      if (saoRivais(relationCache.get(key)!)) return false
    }
  }

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

export async function canFollowUser(
  seguidorId: string,
  seguidoId: string,
  tenantContextoId: string | null,
): Promise<boolean> {
  const map = await canFollowUsers(seguidorId, [seguidoId], tenantContextoId)
  return map.get(seguidoId) ?? false
}

/** Avalia `canFollowUser` para vários alvos com queries compartilhadas. */
export async function canFollowUsers(
  seguidorId: string,
  seguidoIds: string[],
  tenantContextoId: string | null,
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>()
  const alvos = [...new Set(seguidoIds)].filter((id) => id !== seguidorId)
  for (const id of seguidoIds) {
    if (id === seguidorId) result.set(id, false)
  }
  if (alvos.length === 0) return result

  const [aliadosContexto, vinculosMembro, cargos] = await Promise.all([
    tenantContextoId ? getAlliedTenantIds(tenantContextoId) : Promise.resolve([] as string[]),
    db.saasMembro.findMany({
      where: {
        status: 'APROVADO',
        userId: { in: [seguidorId, ...alvos] },
      },
      select: { userId: true, tenantId: true, tipo: true },
    }) as Promise<VinculoMembro[]>,
    // Owner/admin legado sem SaasMembro — conta como vínculo SOCIO na TO.
    db.userRole.findMany({
      where: {
        userId: { in: [seguidorId, ...alvos] },
        tenant: { ativo: true, sintetico: false },
      },
      select: { userId: true, tenantId: true },
    }) as Promise<Array<{ userId: string; tenantId: string }>>,
  ])

  const vistosCargo = new Set(vinculosMembro.map((v) => `${v.userId}:${v.tenantId}`))
  const vinculos: VinculoMembro[] = [...vinculosMembro]
  for (const c of cargos) {
    const key = `${c.userId}:${c.tenantId}`
    if (vistosCargo.has(key)) continue
    vistosCargo.add(key)
    vinculos.push({ userId: c.userId, tenantId: c.tenantId, tipo: 'SOCIO' })
  }

  const tenantsClubeCache = new Map<string, string[]>()
  const relationCache = new Map<string, Awaited<ReturnType<typeof getTenantRelation>>>()

  await Promise.all(
    alvos.map(async (seguidoId) => {
      const ok = await avaliarCanFollowComDados(
        seguidorId,
        seguidoId,
        tenantContextoId,
        aliadosContexto,
        vinculos,
        tenantsClubeCache,
        relationCache,
      )
      result.set(seguidoId, ok)
    }),
  )

  return result
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

/** O alvo segue o viewer com status APROVADO (badge "Segue você"). */
export async function segueVoce(viewerId: string, donoPerfilId: string): Promise<boolean> {
  const seguimento: { id: string } | null = await db.seguimento.findFirst({
    where: { seguidorId: donoPerfilId, seguidoId: viewerId, status: 'APROVADO' },
    select: { id: true },
  })
  return seguimento !== null
}

/** Mapa seguidorId → pode exibir "Seguir de volta" após aprovar a solicitação dele. */
export async function getPodeSeguirDeVoltaPorSeguidor(
  viewerId: string,
  seguidorIds: string[],
  tenantContextoId: string,
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>()
  for (const id of seguidorIds) result.set(id, false)
  if (seguidorIds.length === 0) return result

  const reversos: { seguidoId: string; status: SeguimentoStatus }[] = await db.seguimento.findMany({
    where: { seguidorId: viewerId, seguidoId: { in: seguidorIds } },
    select: { seguidoId: true, status: true },
  })
  const statusPorSeguidor = new Map(reversos.map((r) => [r.seguidoId, r.status]))

  const candidatos = seguidorIds.filter((id) => {
    const status = statusPorSeguidor.get(id)
    return status !== 'APROVADO' && status !== 'PENDENTE' && status !== 'BLOQUEADO'
  })

  await Promise.all(
    candidatos.map(async (id) => {
      const pode = await canFollowUser(viewerId, id, tenantContextoId)
      if (pode) result.set(id, true)
    }),
  )

  return result
}
