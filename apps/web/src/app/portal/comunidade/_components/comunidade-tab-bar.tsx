'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { springSnappy } from '@/lib/motion-presets'
import { ScrollRail } from '@/components/ui/scroll-rail'

export type ComunidadeTabItem =
  | { kind: 'button'; id: string; label: string }
  | { kind: 'link'; id: string; label: string; href: string; icon?: React.ReactNode }

interface ComunidadeTabBarProps {
  items: ComunidadeTabItem[]
  activeId: string
  onTabChange?: (id: string) => void
  layoutId?: string
}

/** Abas com indicador deslizante — grupo, unidade, etc. */
export function ComunidadeTabBar({
  items,
  activeId,
  onTabChange,
  layoutId = 'comunidade-tab-indicator',
}: ComunidadeTabBarProps) {
  // Borda no wrapper e rolagem horizontal no trilho: com 4+ abas (Pedidos,
  // Sobre, Configurações…) a fila estourava a viewport no mobile em vez de
  // rolar. `pb-px` compensa o `-mb-px` das abas, que o overflow recortaria.
  return (
    <div className="border-b border-[rgb(var(--border))]">
      <ScrollRail className="flex gap-2 pb-px">
      {items.map((item) => {
        const ativo = item.id === activeId

        if (item.kind === 'link') {
          return (
            <Link
              key={item.id}
              href={item.href}
              className="relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
            >
              {item.icon}
              {item.label}
            </Link>
          )
        }

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange?.(item.id)}
            className={[
              'relative -mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
              ativo
                ? 'border-transparent font-semibold text-[rgb(var(--color-primary-fg))]'
                : 'border-transparent font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {item.label}
            {ativo && (
              <m.span
                layoutId={layoutId}
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[rgb(var(--color-primary))]"
                transition={springSnappy}
              />
            )}
          </button>
        )
      })}
      </ScrollRail>
    </div>
  )
}
