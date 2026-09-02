import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { Building2, ClipboardCheck, Crown, Eye, MapPin, Network } from 'lucide-react'
import { db } from '@torcida/db'
import { PERMISSIONS, hasPermission } from '@torcida/types'
import { tenantIsAdministracaoSede } from '@/lib/authz'
import { contextoAdmin, montarTabsModulo } from '@/lib/admin-modulos'
import { AdminModuleTabBar, AdminModuleTabs, AdminPageHeader } from '@/components/admin/ui'

const ICONE = 'h-4 w-4 shrink-0'

/**
 * Shell do módulo Estrutura — organização interna da torcida: console
 * consolidado, unidades (sedes), mural organizacional e fila de afiliação.
 *
 * Route group: as quatro rotas mantêm suas URLs (`/admin/torcida`,
 * `/admin/sedes`, `/admin/hierarquia`, `/admin/afiliacoes`), o que preserva
 * deep links e o `Notificacao.link` já gravado de `SOLICITACAO_UNIDADE_CRIADA`.
 */
export default async function EstruturaModuloLayout({ children }: { children: ReactNode }) {
  // Tenant e permissões da mesma fonte: header, contagem e tabs sempre falam do
  // mesmo tenant ativo (ver `contextoAdmin`).
  const { tenant, permissoes } = await contextoAdmin()

  // Console global e fila de afiliação só existem na Sede principal (tipo SEDE):
  // liderança de subsede/PDE tem owner ('*'), mas as etapas não se aplicam.
  const precisaSaberSeEhSede =
    hasPermission(permissoes, PERMISSIONS.TORCIDA_GLOBAL_VIEW) ||
    hasPermission(permissoes, PERMISSIONS.AFFILIATION_MANAGE)
  const ehSedePrincipal = precisaSaberSeEhSede ? await tenantIsAdministracaoSede(tenant.id) : false

  const solicitacoesPendentes: number =
    ehSedePrincipal && hasPermission(permissoes, PERMISSIONS.AFFILIATION_MANAGE)
      ? await db.solicitacaoUnidade.count({ where: { tenantId: tenant.id, status: 'PENDENTE' } })
      : 0

  const tabs = montarTabsModulo('estrutura', permissoes, {
    'visao-geral': { icon: <Eye className={ICONE} /> },
    unidades: { icon: <MapPin className={ICONE} /> },
    hierarquia: { icon: <Network className={ICONE} /> },
    solicitacoes: {
      icon: <ClipboardCheck className={ICONE} />,
      count: solicitacoesPendentes,
      countClass: 'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
    },
    presidencia: { icon: <Crown className={ICONE} /> },
  }).filter((tab) => tab.id !== 'solicitacoes' || ehSedePrincipal)

  if (tabs.length === 0) redirect('/admin')

  return (
    <>
      <AdminPageHeader
        title="Estrutura"
        description={`Organização de ${tenant.nome} — unidades, hierarquia e afiliação.`}
        icon={<Building2 className="h-5 w-5" />}
      >
        <AdminModuleTabBar tabs={tabs} />
      </AdminPageHeader>

      <div className="app-container space-y-6 py-6">
        <AdminModuleTabs tabs={tabs} chrome="panel">
          {children}
        </AdminModuleTabs>
      </div>
    </>
  )
}
