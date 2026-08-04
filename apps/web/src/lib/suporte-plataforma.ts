import { cache } from 'react'
import { db } from '@torcida/db'
import { isSuperAdminEmail } from '@/lib/tenant-context'

/**
 * Suporte da plataforma — quando o super-admin pode operar as configurações
 * reservadas ao owner de uma unidade.
 *
 * O super-admin passa por cima do RBAC por tenant (`assertPermission`), mas
 * `assertTenantOwner` sempre foi um gate à parte: as decisões de peso do
 * Presidente (afiliação, hierarquia visível, canal restrito, documentos do
 * cadastro) exigem o cargo de sistema `owner` no tenant. O efeito era que o
 * super-admin via o formulário e a gravação falhava.
 *
 * A regra passa a ser explícita e **isolada por unidade**:
 *
 * - unidade **sem liderança da torcida** (recém-criada, presidente ainda não
 *   definido): o super-admin opera — senão não há quem configure. Owner
 *   técnico do setup (`SUPER_ADMIN_EMAILS`) **não conta** como liderança;
 * - unidade **com presidente** (owner que não é super-admin): só opera se a
 *   própria liderança tiver ligado o consentimento
 *   (`Tenant.suportePlataforma`). O toggle é do owner, nunca do
 *   super-admin — consentimento que o beneficiário concede a si mesmo não é
 *   consentimento.
 *
 * Vale igual para a Sede e para subsede/PDE: cada tenant guarda a própria
 * chave, e ligar na Sede não liga em nenhuma unidade.
 */

export interface EstadoSuportePlataforma {
  /**
   * A unidade já tem presidente/liderança da torcida — cargo `owner` em
   * alguém que **não** é só operador da plataforma (`SUPER_ADMIN_EMAILS`).
   */
  temLideranca: boolean
  /** Consentimento gravado pela liderança nesta unidade. */
  consentido: boolean
  /** Resultado: super-admin pode mexer nas configurações de owner aqui. */
  superAdminPodeOperar: boolean
}

/**
 * Existe liderança **da torcida** neste tenant.
 * Owner técnico do setup (e-mail em `SUPER_ADMIN_EMAILS`) não conta — o
 * bootstrap não bloqueia o próprio operador da plataforma.
 */
export const tenantTemOwner = cache(async function tenantTemOwner(
  tenantId: string,
): Promise<boolean> {
  const owners: Array<{ user: { email: string | null } }> = await db.userRole.findMany({
    where: { tenantId, role: { isSystem: true, nome: 'owner' } },
    select: { user: { select: { email: true } } },
  })
  return owners.some((o) => !isSuperAdminEmail(o.user.email))
})

/** Estado do suporte da plataforma nesta unidade (nunca ler o campo direto). */
export const getEstadoSuportePlataforma = cache(async function getEstadoSuportePlataforma(
  tenantId: string,
): Promise<EstadoSuportePlataforma> {
  const [temLideranca, row]: [boolean, { suportePlataforma: boolean } | null] = await Promise.all([
    tenantTemOwner(tenantId),
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { suportePlataforma: true },
    }),
  ])

  const consentido = row?.suportePlataforma ?? false
  return {
    temLideranca,
    consentido,
    superAdminPodeOperar: !temLideranca || consentido,
  }
})
