'use client'

import { AdminTabs, type AdminTabsProps } from './admin-tabs'
import { buildAdminHref } from '@/lib/admin-href'
import { lookupTabBadge } from '@/lib/notificacoes-menu-badges'
import { useAdminNavbarSnapshot } from '@/lib/use-admin-navbar-context'

const CLASSE_PENDENCIA_NOTIF =
  'bg-[rgb(var(--color-danger)_/_0.16)] text-[rgb(var(--color-danger-fg))]'

/**
 * `AdminTabs` com overlay das não-lidas do sino (`tabBadges`).
 * Para listagens por query (`?status=` / `?tab=`): Sócios, Torcedores,
 * Patrimônio, Bandeiras. Módulos com rota própria continuam em
 * `AdminModuleTabs`.
 */
export function AdminPendingTabs(props: AdminTabsProps) {
  const { tabBadges } = useAdminNavbarSnapshot()
  const paramKey = props.paramKey ?? 'tab'
  const tabs = props.tabs.map((tab) => {
    const href =
      tab.href ??
      buildAdminHref(props.basePath ?? '', { ...props.extraParams, [paramKey]: tab.id })
    const live = lookupTabBadge(tabBadges, href)
    const count = Math.max(tab.count ?? 0, live)
    if (count <= 0) return tab
    return {
      ...tab,
      count,
      countClass: live > 0 ? CLASSE_PENDENCIA_NOTIF : tab.countClass,
    }
  })

  return <AdminTabs {...props} tabs={tabs} />
}
