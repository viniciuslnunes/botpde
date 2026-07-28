'use client'

import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { m } from 'motion/react'
import { springSnappy } from '@/lib/motion-presets'
import { buildAdminHref } from '@/lib/admin-href'
import { adminTabIds } from './admin-tab-ids'

export interface AdminTabItem {
  id: string
  label: string
  /** Contagem opcional exibida como badge; some quando 0 e a tab não está ativa. */
  count?: number
  /** Classe de cor do badge quando a tab NÃO está ativa (ex.: pendências em amber). */
  countClass?: string
  /**
   * Ícone como ReactNode (ex.: `<Users className="h-4 w-4" />`).
   * Não passe o componente Lucide (`Users`) — funções não serializam Server→Client.
   */
  icon?: ReactNode
}

export interface AdminTabsProps {
  tabs: AdminTabItem[]
  basePath: string
  activeId: string
  /** Nome do query param que carrega a tab ativa — default `'tab'`. */
  paramKey?: string
  /** Demais params da URL a preservar ao trocar de tab (paginação, busca, etc.). */
  extraParams?: Record<string, string | undefined>
}

/**
 * Barra de tabs padrão do admin — URL-driven (navegação real via `Link`,
 * funciona sem JS), ARIA de tabs completo e roving tabindex por teclado
 * (setas/Home/End). Para seções de conteúdo mutuamente exclusivas; filtros
 * que se combinam com paginação/busca continuam sendo `searchParams` simples.
 */
export function AdminTabs({
  tabs,
  basePath,
  activeId,
  paramKey = 'tab',
  extraParams,
}: AdminTabsProps) {
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([])

  function focusTab(index: number) {
    linkRefs.current[index]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = Math.max(
      0,
      tabs.findIndex((tab) => tab.id === activeId),
    )
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusTab((currentIndex + 1) % tabs.length)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusTab((currentIndex - 1 + tabs.length) % tabs.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusTab(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusTab(tabs.length - 1)
    }
  }

  return (
    <div
      role="tablist"
      onKeyDown={handleKeyDown}
      className="app-scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
    >
      {tabs.map((tab, index) => {
        const active = tab.id === activeId
        const showCount = tab.count !== undefined && (tab.count > 0 || active)
        const { tabId, panelId } = adminTabIds(paramKey, tab.id)
        const href = buildAdminHref(basePath, { ...extraParams, [paramKey]: tab.id })

        return (
          <m.div key={tab.id} className="shrink-0" whileTap={{ scale: 0.97 }} transition={springSnappy}>
            <Link
              ref={(el) => {
                linkRefs.current[index] = el
              }}
              href={href}
              id={tabId}
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              className={[
                'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'bg-[rgb(var(--color-primary)_/_0.14)] font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                  : 'font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              {tab.icon}
              {tab.label}
              {showCount && (
                <span
                  className={[
                    'rounded-full px-1.5 py-0.5 text-xs font-semibold',
                    active
                      ? 'bg-[rgb(var(--color-primary))] text-[rgb(var(--color-primary-on))]'
                      : (tab.countClass ??
                        'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]'),
                  ].join(' ')}
                >
                  {tab.count}
                </span>
              )}
            </Link>
          </m.div>
        )
      })}
    </div>
  )
}
