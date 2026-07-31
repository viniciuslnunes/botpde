import { db } from '@torcida/db'
import { getDescendantTenantIds } from '@/lib/hierarquia'
import { tenantIsAdministracaoSede } from '@/lib/authz'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import {
  calculateEffectivePermissions,
  hasPermission,
  PERMISSIONS,
} from '@torcida/types'
import type { Session } from 'next-auth'
import type { Tenant } from '@torcida/db'

export type SedeAcessoMae = {
  id: string
  nome: string
  tipo: string
  tenantId: string | null
  sedeId: string | null
  canalConversaId: string | null
  responsavelUserId: string | null
  /** Unidade em tenant filho (Caso B) sob a árvore da mãe logada. */
  portalProprio: boolean
}

/**
 * Autoriza mutação de uma Sede a partir do tenant logado:
 * - unidade local (`tenantId` = mãe) → `sedes:manage`
 * - unidade Caso B (portal próprio descendente) → `affiliation:manage`
 *   na sede principal (Presidente/Vice ou perfil com essa permissão)
 */
export async function assertPodeMutarSedeNaArvore(
  session: Session,
  tenant: Tenant,
  sedeId: string,
  opts?: { requerAffiliationParaPortal?: boolean },
): Promise<SedeAcessoMae> {
  const requerAffiliation = opts?.requerAffiliationParaPortal !== false

  const sede: {
    id: string
    nome: string
    tipo: string
    tenantId: string | null
    sedeId: string | null
    canalConversaId: string | null
    responsavelUserId: string | null
  } | null = await db.sede.findUnique({
    where: { id: sedeId },
    select: {
      id: true,
      nome: true,
      tipo: true,
      tenantId: true,
      sedeId: true,
      canalConversaId: true,
      responsavelUserId: true,
    },
  })
  if (!sede) throw new Error('Sede não encontrada')

  if (sede.tenantId === tenant.id) {
    return { ...sede, portalProprio: false }
  }

  if (!sede.tenantId) throw new Error('Sede não encontrada')

  const isSuper = isSuperAdminEmail(session.user.email)
  if (!isSuper) {
    if (!(await tenantIsAdministracaoSede(tenant.id))) {
      throw new Error('Somente a sede principal pode gerir unidades com portal próprio.')
    }
    if (requerAffiliation) {
      const { rolePermissions, overrides } = await getUserPermissionsInTenant(
        session.user.id,
        tenant.id,
      )
      const effective = calculateEffectivePermissions(rolePermissions, overrides)
      if (!hasPermission(effective, PERMISSIONS.AFFILIATION_MANAGE)) {
        throw new Error(
          'Sem permissão para gerir unidades com portal próprio (exige afiliação de unidades).',
        )
      }
    }
  }

  const descendentes: string[] = await getDescendantTenantIds(tenant.id)
  if (!descendentes.includes(sede.tenantId)) {
    throw new Error('Sede não encontrada')
  }

  return { ...sede, portalProprio: true }
}

/** UI: ator na sede principal com `affiliation:manage` (ou super-admin). */
export async function atorPodeGerirPortalProprio(
  session: Session | null,
  tenantId: string,
): Promise<boolean> {
  if (!session?.user?.id) return false
  if (isSuperAdminEmail(session.user.email)) return true
  if (!(await tenantIsAdministracaoSede(tenantId))) return false

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    session.user.id,
    tenantId,
  )
  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  return hasPermission(effective, PERMISSIONS.AFFILIATION_MANAGE)
}
