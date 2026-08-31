'use client'

import { AdminTabs, type AdminTabItem } from '@/components/admin/ui'
import { useNavbarSnapshot } from '@/lib/use-navbar-context'

const CLASSE_PENDENCIA_NOTIF =
  'bg-[rgb(var(--color-danger)_/_0.16)] text-[rgb(var(--color-danger-fg))]'

/**
 * Tabs do cockpit com overlay das não-lidas do departamento (áreas / projetos /
 * equipe / pedidos / fila). Contagem SSR permanece; se houver notificação
 * pendente, o badge pinta de alerta e usa o maior dos dois.
 */
export function DepartamentoCockpitTabs({
  tabs,
  slug,
  basePath,
  activeId,
}: {
  tabs: AdminTabItem[]
  slug: string
  basePath: string
  activeId: string
}) {
  const { navBadges } = useNavbarSnapshot()
  const secoes = navBadges.porSecao[slug]

  const tabsComPendencia = tabs.map((tab) => {
    const live =
      tab.id === 'areas' ||
      tab.id === 'projetos' ||
      tab.id === 'equipe' ||
      tab.id === 'pedidos' ||
      tab.id === 'fila'
        ? (secoes?.[tab.id as 'areas' | 'projetos' | 'equipe' | 'pedidos' | 'fila'] ?? 0)
        : 0
    const count = Math.max(tab.count ?? 0, live)
    if (count <= 0) return tab
    return {
      ...tab,
      count,
      countClass: live > 0 ? CLASSE_PENDENCIA_NOTIF : tab.countClass,
    }
  })

  return <AdminTabs tabs={tabsComPendencia} basePath={basePath} activeId={activeId} paramKey="tab" />
}
