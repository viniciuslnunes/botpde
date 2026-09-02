'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { AdminTabs, type AdminTabItem } from './admin-tabs'
import { adminTabIds } from './admin-tab-ids'
import { useAdminNavbarSnapshot } from '@/lib/use-admin-navbar-context'

/** Param usado só para gerar os ids de ARIA — o modo rota não usa query string. */
const PARAM_KEY = 'modulo'

const CLASSE_PENDENCIA_NOTIF =
  'bg-[rgb(var(--color-danger)_/_0.16)] text-[rgb(var(--color-danger-fg))]'

export interface AdminModuleTabItem extends AdminTabItem {
  href: string
  /**
   * Rotas irmãs que também ativam esta tab — para páginas que pertencem à
   * etapa mas não aparecem na barra (ex.: `/admin/bar/estornos` sob Vendas).
   */
  matchPaths?: string[]
}

function semQuery(href: string): string {
  return href.split('?')[0] ?? href
}

/** Tab ativa = rota casada mais específica, para o href raiz não capturar as filhas. */
export function resolveAdminModuleTab(tabs: AdminModuleTabItem[], pathname: string): string {
  let ativa: string | null = null
  let maisEspecifica = -1

  for (const tab of tabs) {
    for (const alvo of [tab.href, ...(tab.matchPaths ?? [])]) {
      const base = semQuery(alvo)
      const casa = pathname === base || pathname.startsWith(`${base}/`)
      if (casa && base.length > maisEspecifica) {
        maisEspecifica = base.length
        ativa = tab.id
      }
    }
  }

  return ativa ?? tabs[0]?.id ?? ''
}

function useAdminModuleTabState(tabs: AdminModuleTabItem[]) {
  const pathname = usePathname()
  const activeId = resolveAdminModuleTab(tabs, pathname)
  const { tabId, panelId } = adminTabIds(PARAM_KEY, activeId)
  const { tabBadges } = useAdminNavbarSnapshot()

  const tabsComPendencia = tabs.map((tab) => {
    const live = tabBadges[semQuery(tab.href)] ?? 0
    const ssr = tab.count ?? 0
    const count = Math.max(ssr, live)
    if (count <= 0) return tab
    return {
      ...tab,
      count,
      countClass: live > 0 ? CLASSE_PENDENCIA_NOTIF : tab.countClass,
    }
  })

  return { activeId, tabId, panelId, tabsComPendencia }
}

/**
 * Só a barra — entra em `AdminPageHeader` children, no mesmo lugar que as
 * tabs de Torcedores/Sócios. O painel fica em `AdminModuleTabs chrome="panel"`.
 */
export function AdminModuleTabBar({ tabs }: { tabs: AdminModuleTabItem[] }) {
  const { tabsComPendencia, activeId } = useAdminModuleTabState(tabs)
  return <AdminTabs tabs={tabsComPendencia} activeId={activeId} paramKey={PARAM_KEY} />
}

export interface AdminModuleTabsProps {
  tabs: AdminModuleTabItem[]
  /** Conteúdo da rota ativa — vira o `tabpanel` ligado à tab correspondente. */
  children: ReactNode
  /**
   * `full` (default): barra + painel, para chrome que ainda não tem
   * `AdminPageHeader` (ex.: cadastro imersivo no super-admin).
   * `panel`: só o tabpanel — a barra vai no cabeçalho via `AdminModuleTabBar`.
   */
  chrome?: 'full' | 'panel'
}

/**
 * Barra de tabs em que cada tab é uma **rota** do módulo, não um `?tab=`.
 * No admin, a barra mora no `AdminPageHeader` (`AdminModuleTabBar`) e este
 * componente renderiza só o painel (`chrome="panel"`).
 *
 * Contagem SSR (fila de denúncia, cobrança vencida…) combina com não-lidas
 * do sino (`tabBadges`): mostra o maior dos dois, e pinta de alerta quando
 * há notificação pendente.
 */
export function AdminModuleTabs({ tabs, children, chrome = 'full' }: AdminModuleTabsProps) {
  const { activeId, tabId, panelId, tabsComPendencia } = useAdminModuleTabState(tabs)

  return (
    <>
      {chrome === 'full' ? (
        <AdminTabs tabs={tabsComPendencia} activeId={activeId} paramKey={PARAM_KEY} />
      ) : null}
      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-6">
        {children}
      </div>
    </>
  )
}
