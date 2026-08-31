// Escopo do brechó: praça da Sede raiz do portal ativo, sócio na linhagem,
// R5, aliados. Nunca usa vínculo de outra torcida (Gaviões no canal da Mancha
// não herda a praça da casa).
import { cache } from 'react'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { ExpectedError } from '@/lib/expected-error'
import { getActiveTenant } from '@/lib/tenant'
import { getAlliedTenantIds, getTorcidaLineageTenantIds } from '@/lib/hierarquia'
import { getTenantsRestritos } from '@/lib/isolamento'
import { resolverTenantRaizId } from '@/lib/membros-sede'
import { podeParticiparBrecho, raizesDoFeedBrecho } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'

export type BrechoContexto = {
  userId: string
  email: string | null
  ativoId: string
  raizId: string
  lineageIds: string[]
  origemTenantId: string
  raizesFeed: string[]
}

type OrigemLite = { tenantId: string }

export const resolverContextoBrecho = cache(async function resolverContextoBrecho(
  userId: string,
  email?: string | null,
): Promise<BrechoContexto | null> {
  const ativo = await getActiveTenant(userId, email)
  if (!ativo || ativo.sintetico) return null

  const raizId = await resolverTenantRaizId(ativo.id)
  const lineageIds: string[] = await getTorcidaLineageTenantIds(raizId)

  const origens: OrigemLite[] = await db.saasMembro.findMany({
    where: {
      userId,
      tenantId: { in: lineageIds },
      tipo: 'SOCIO',
      status: 'APROVADO',
      desligadoEm: null,
      espelhado: false,
    },
    select: { tenantId: true },
    orderBy: { criadoEm: 'desc' },
  })

  const restritos = await getTenantsRestritos()
  const soUnidadesRestritas =
    origens.length > 0 && origens.every((o) => restritos.has(o.tenantId))
  const gate = podeParticiparBrecho({
    socioAprovadoNaLinhaagem: origens.length > 0,
    soUnidadesRestritas,
  })
  if (!gate.ok) return null

  const raiz: { brechoAliados: boolean } | null = await db.tenant.findUnique({
    where: { id: raizId },
    select: { brechoAliados: true },
  })

  let raizesAliadas: string[] = []
  if (raiz?.brechoAliados) {
    const aliados: string[] = await getAlliedTenantIds(raizId)
    const unique = new Set<string>()
    for (const id of aliados) {
      unique.add(await resolverTenantRaizId(id))
    }
    unique.delete(raizId)
    raizesAliadas = [...unique]
  }

  const origemTenantId =
    origens.find((o) => o.tenantId === ativo.id)?.tenantId ?? origens[0]!.tenantId

  return {
    userId,
    email: email ?? null,
    ativoId: ativo.id,
    raizId,
    lineageIds,
    origemTenantId,
    raizesFeed: raizesDoFeedBrecho({
      raizId,
      brechoAliados: Boolean(raiz?.brechoAliados),
      raizesAliadas,
    }),
  }
})

export async function assertSocioBrecho(): Promise<BrechoContexto> {
  const session = await auth()
  if (!session?.user?.id) throw new ExpectedError('Você precisa estar logado.')
  const ctx = await resolverContextoBrecho(session.user.id, session.user.email)
  if (!ctx) {
    throw new ExpectedError('O brechó é só para sócios aprovados desta torcida.')
  }
  return ctx
}

export type BrechoStaffContexto = {
  userId: string
  tenantId: string
  raizId: string
  lineageIds: string[]
  podeGerir: boolean
}

/** Staff de Materiais/Loja em qualquer unidade da linhagem — praça é da raiz. */
export async function assertStaffBrecho(): Promise<BrechoStaffContexto> {
  const { session, tenant } = await assertAnyPermission([
    PERMISSIONS.STORE_VIEW_ORDERS,
    PERMISSIONS.STORE_MANAGE,
  ])
  const raizId = await resolverTenantRaizId(tenant.id)
  const lineageIds: string[] = await getTorcidaLineageTenantIds(raizId)
  const { userTemPermissaoLojaTicket } = await import('@/lib/loja-ticket')
  const { podeVer, podeGerir } = await userTemPermissaoLojaTicket(session.user.id, tenant.id)
  if (!podeVer) throw new ExpectedError('Sem permissão para o brechó.')
  return {
    userId: session.user.id,
    tenantId: tenant.id,
    raizId,
    lineageIds,
    podeGerir,
  }
}
