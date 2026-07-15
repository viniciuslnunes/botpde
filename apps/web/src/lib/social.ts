import { db } from '@torcida/db'
import { saoRivais } from '@torcida/types'
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
  const perfil: { perfilPrivado: boolean } | null = await db.perfilMembro.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { perfilPrivado: true },
  })
  return { perfilPrivado: perfil?.perfilPrivado ?? true }
}

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

export async function canFollowUser(
  seguidorId: string,
  seguidoId: string,
  tenantContextoId: string | null,
): Promise<boolean> {
  if (seguidorId === seguidoId) return false

  const [aliadosContexto, vinculos] = await Promise.all([
    tenantContextoId ? getAlliedTenantIds(tenantContextoId) : Promise.resolve([] as string[]),
    db.saasMembro.findMany({
      where: {
        status: 'APROVADO',
        userId: { in: [seguidorId, seguidoId] },
      },
      select: { userId: true, tenantId: true, tipo: true },
    }) as Promise<{ userId: string; tenantId: string; tipo: 'SOCIO' | 'TORCEDOR' }[]>,
  ])

  // Sem tenant de contexto (ator é torcedor global) não há recorte de
  // visibilidade — a interseção por clube/aliança abaixo já limita o alcance.
  const visiveisNoContexto: Set<string> | null = tenantContextoId
    ? new Set([tenantContextoId, ...aliadosContexto])
    : null
  const noContexto = (tenantId: string): boolean =>
    visiveisNoContexto === null || visiveisNoContexto.has(tenantId)

  const seguidorVinculos = vinculos.filter((v) => v.userId === seguidorId && noContexto(v.tenantId))
  const seguidoVinculos = vinculos.filter((v) => v.userId === seguidoId && noContexto(v.tenantId))

  // Torcedor global: sem vínculo real, o "conjunto de tenants" do lado é o das
  // torcidas do clube dele — segue/é seguido por qualquer torcida do mesmo clube.
  const seguidorTenants =
    seguidorVinculos.length > 0
      ? seguidorVinculos.map((v) => v.tenantId)
      : await getTenantsDoClubeDoTorcedor(seguidorId)
  const seguidoTenants =
    seguidoVinculos.length > 0
      ? seguidoVinculos.map((v) => v.tenantId)
      : await getTenantsDoClubeDoTorcedor(seguidoId)

  if (seguidorTenants.length === 0 || seguidoTenants.length === 0) return false

  // Bloqueio de rivalidade (spec-onboarding §3.2): SOMENTE quando AMBOS os
  // lados são sócios (tipo SOCIO, status APROVADO — o where já filtra) de
  // torcidas rivais. Torcedores se relacionam livremente, inclusive entre
  // rivais. canMessageUser delega para cá — este é o ponto único do funil.
  for (const vinculoSeguidor of seguidorVinculos) {
    if (vinculoSeguidor.tipo !== 'SOCIO') continue
    for (const vinculoSeguido of seguidoVinculos) {
      if (vinculoSeguido.tipo !== 'SOCIO') continue
      if (vinculoSeguidor.tenantId === vinculoSeguido.tenantId) continue
      const relation = await getTenantRelation(vinculoSeguidor.tenantId, vinculoSeguido.tenantId)
      if (saoRivais(relation)) return false
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
