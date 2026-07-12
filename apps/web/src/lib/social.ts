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
      exibirCidade: true,
      exibirSede: true,
      exibirDesde: true,
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
      select: { userId: true, tenantId: true, tipo: true },
    }) as Promise<{ userId: string; tenantId: string; tipo: 'SOCIO' | 'TORCEDOR' }[]>,
  ])

  const visiveisNoContexto = new Set([tenantContextoId, ...aliadosContexto])
  const seguidorVinculos = vinculos.filter(
    (v) => v.userId === seguidorId && visiveisNoContexto.has(v.tenantId),
  )
  const seguidoVinculos = vinculos.filter(
    (v) => v.userId === seguidoId && visiveisNoContexto.has(v.tenantId),
  )

  if (seguidorVinculos.length === 0 || seguidoVinculos.length === 0) return false

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

  const seguidorTenants = seguidorVinculos.map((v) => v.tenantId)
  const seguidoTenants = seguidoVinculos.map((v) => v.tenantId)

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
