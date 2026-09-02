import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { KeyRound, Palette, Plug, ScrollText, Scale, Settings, SlidersHorizontal } from 'lucide-react'
import { contextoAdmin, montarTabsModulo } from '@/lib/admin-modulos'
import { AdminModuleTabBar, AdminModuleTabs, AdminPageHeader } from '@/components/admin/ui'

const ICONE = 'h-4 w-4 shrink-0'

/**
 * Shell do módulo Plataforma — o que configura a torcida na plataforma, não a
 * operação dela: ajustes, transparência do portal, integrações, identidade
 * visual, controle de acesso e trilha de auditoria.
 *
 * Route group: `/admin/configuracoes`, `/admin/design`, `/admin/acessos` e
 * `/admin/auditoria` mantêm suas URLs — nenhum deep link quebra.
 */
export default async function PlataformaModuloLayout({ children }: { children: ReactNode }) {
  // Tenant e permissões da mesma fonte — ver `contextoAdmin`.
  const { tenant, permissoes } = await contextoAdmin()

  const tabs = montarTabsModulo('plataforma', permissoes, {
    geral: { icon: <SlidersHorizontal className={ICONE} /> },
    transparencia: { icon: <Scale className={ICONE} /> },
    integracoes: { icon: <Plug className={ICONE} /> },
    identidade: { icon: <Palette className={ICONE} /> },
    acessos: { icon: <KeyRound className={ICONE} /> },
    auditoria: { icon: <ScrollText className={ICONE} /> },
  })

  if (tabs.length === 0) redirect('/admin')

  return (
    <>
      <AdminPageHeader
        title="Plataforma"
        description={`Ajustes, identidade, acessos e auditoria de ${tenant.nome}.`}
        icon={<Settings className="h-5 w-5" />}
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
