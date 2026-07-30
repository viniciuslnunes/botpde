'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { AdminTabs, type AdminTabItem } from './admin-tabs'
import { adminTabIds } from './admin-tab-ids'

/** Param usado só para gerar os ids de ARIA — o modo rota não usa query string. */
const PARAM_KEY = 'modulo'

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

export interface AdminModuleTabsProps {
  tabs: AdminModuleTabItem[]
  /** Conteúdo da rota ativa — vira o `tabpanel` ligado à tab correspondente. */
  children: ReactNode
}

/**
 * Barra de tabs em que cada tab é uma **rota** do módulo, não um `?tab=`.
 * Montada no `layout.tsx` do segmento: o hub vira a primeira etapa e as
 * sub-rotas passam a ser painéis irmãos, em vez de destinos soltos no menu
 * lateral. A tab ativa vem do pathname, então deep links seguem válidos.
 */
export function AdminModuleTabs({ tabs, children }: AdminModuleTabsProps) {
  const pathname = usePathname()
  const activeId = resolveAdminModuleTab(tabs, pathname)
  const { tabId, panelId } = adminTabIds(PARAM_KEY, activeId)

  return (
    <>
      <AdminTabs tabs={tabs} activeId={activeId} paramKey={PARAM_KEY} />
      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-6">
        {children}
      </div>
    </>
  )
}
