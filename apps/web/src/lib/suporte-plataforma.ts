import { cache } from 'react'
import { db } from '@torcida/db'

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
 * - unidade **sem owner** (recém-criada, liderança ainda não definida): o
 *   super-admin opera — senão não há quem configure;
 * - unidade **com owner**: só opera se a própria liderança tiver ligado o
 *   consentimento (`Tenant.suportePlataforma`). O toggle é do owner, nunca do
 *   super-admin — consentimento que o beneficiário concede a si mesmo não é
 *   consentimento.
 *
 * Vale igual para a Sede e para subsede/PDE: cada tenant guarda a própria
 * chave, e ligar na Sede não liga em nenhuma unidade.
 */

export interface EstadoSuportePlataforma {
  /** A unidade já tem alguém com o cargo de sistema `owner`. */
  temLideranca: boolean
  /** Consentimento gravado pela liderança nesta unidade. */
  consentido: boolean
  /** Resultado: super-admin pode mexer nas configurações de owner aqui. */
  superAdminPodeOperar: boolean
}

/** Existe alguém com o cargo de sistema `owner` neste tenant. */
export const tenantTemOwner = cache(async function tenantTemOwner(
  tenantId: string,
): Promise<boolean> {
  const owner: { id: string } | null = await db.userRole.findFirst({
    where: { tenantId, role: { isSystem: true, nome: 'owner' } },
    select: { id: true },
  })
  return owner !== null
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
