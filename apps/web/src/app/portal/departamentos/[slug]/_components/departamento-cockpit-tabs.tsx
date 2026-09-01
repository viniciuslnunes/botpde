'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { AdminTabs, type AdminTabItem } from '@/components/admin/ui'
import { useNavbarSnapshot } from '@/lib/use-navbar-context'

const CLASSE_PENDENCIA_NOTIF =
  'bg-[rgb(var(--color-danger)_/_0.16)] text-[rgb(var(--color-danger-fg))]'

function abaAtiva(pathname: string, slug: string, tabQuery: string | null): string {
  const base = `/portal/departamentos/${slug}`
  if (pathname === `${base}/areas` || pathname.startsWith(`${base}/areas/`)) return 'areas'
  if (pathname === `${base}/projetos` || pathname.startsWith(`${base}/projetos/`)) return 'projetos'
  if (tabQuery === 'equipe' || tabQuery === 'fila' || tabQuery === 'pedidos') return tabQuery
  return 'painel'
}

/**
 * Tabs do cockpit: Áreas e Projetos são rotas; Equipe/Fila/Pedidos continuam
 * `?tab=` na home. Overlay das não-lidas pinta o badge quando há pendência.
 */
export function DepartamentoCockpitTabs({
  tabs,
  slug,
}: {
  tabs: AdminTabItem[]
  slug: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { navBadges } = useNavbarSnapshot()
  const secoes = navBadges.porSecao[slug]
  const activeId = abaAtiva(pathname, slug, searchParams.get('tab'))

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

  return <AdminTabs tabs={tabsComPendencia} activeId={activeId} paramKey="tab" />
}
