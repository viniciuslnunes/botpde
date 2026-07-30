import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import {
  WILDCARD_PERMISSION,
  calculateEffectivePermissions,
  getAdminModulo,
  primeiraTabPermitida,
  tabsPermitidasDoModulo,
} from '@torcida/types'
import { auth } from '@/lib/auth'
import { getActiveTenant, getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import type { AdminModuleTabItem } from '@/components/admin/ui'

/** Ícone e contagem de uma tab — ficam no layout porque não serializam. */
export interface AdminTabEnfeite {
  icon?: ReactNode
  count?: number
  countClass?: string
}

/**
 * Permissões efetivas do usuário no tenant ativo, para decidir quais etapas de
 * um módulo oferecer. Super admin recebe o wildcard: opera fora do RBAC por
 * tenant e enxerga o módulo inteiro.
 *
 * Nunca substitui `assertPermission` — cada rota-tab segue responsável pelo
 * próprio gate no servidor.
 */
export async function permissoesEfetivasNoAdmin(): Promise<string[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  if (isSuperAdminEmail(session.user.email)) return [WILDCARD_PERMISSION]

  const tenant = await getActiveTenant(session.user.id, session.user.email)
  if (!tenant) return []

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  return calculateEffectivePermissions(rolePermissions, overrides)
}

/**
 * Monta a barra de tabs de um módulo declarado em `ADMIN_MODULOS`, já filtrada
 * pelas permissões efetivas, aplicando ícone/contagem por id de tab.
 *
 * Tab declarada no registro mas sem enfeite aqui aparece sem ícone — o registro
 * é a fonte da estrutura; este mapa é só apresentação.
 */
export function montarTabsModulo(
  moduloId: string,
  permissoes: string[],
  enfeites: Record<string, AdminTabEnfeite> = {},
): AdminModuleTabItem[] {
  return tabsPermitidasDoModulo(moduloId, permissoes).map((tab) => ({
    id: tab.id,
    label: tab.label,
    href: tab.href,
    ...(tab.matchPaths ? { matchPaths: [...tab.matchPaths] } : {}),
    ...enfeites[tab.id],
  }))
}

/**
 * Garante que o usuário consegue abrir alguma etapa do módulo e, se a rota
 * atual for a raiz que ele não pode ver, manda para a primeira etapa que pode.
 *
 * É o que evita expulsar para `/admin` quem tem só uma permissão parcial —
 * `store:view_orders` cai em Pedidos, `news:curate` cai em Notícias.
 *
 * @param rotaAtual pathname do segmento sendo renderizado (sem query)
 */
export function redirecionarParaTabPermitida(
  moduloId: string,
  permissoes: string[],
  rotaAtual: string,
): void {
  const tabs = tabsPermitidasDoModulo(moduloId, permissoes)
  if (tabs.length === 0) redirect('/admin')

  const podeVerRotaAtual = tabs.some(
    (tab) =>
      [tab.href, ...(tab.matchPaths ?? [])].some(
        (alvo) => rotaAtual === alvo || rotaAtual.startsWith(`${alvo}/`),
      ),
  )
  if (podeVerRotaAtual) return

  const destino = primeiraTabPermitida(moduloId, permissoes)
  if (destino && destino !== rotaAtual) redirect(destino)
}

/** Título/descrição do módulo não vivem no registro — só a estrutura vive. */
export function moduloExiste(moduloId: string): boolean {
  return getAdminModulo(moduloId) !== null
}
