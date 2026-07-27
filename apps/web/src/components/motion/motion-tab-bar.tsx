'use client'

import { m } from 'motion/react'
import { springSnappy } from '@/lib/motion-presets'

export interface MotionTabItem {
  id: string
  label: string
  count?: number
}

interface MotionTabBarProps {
  items: MotionTabItem[]
  activeId: string
  onTabChange: (id: string) => void
  layoutId?: string
}

/** Abas com indicador deslizante (layoutId) — genérico, fora da Comunidade.
 * Ver docs/frontend/motion.md §3. */
export function MotionTabBar({
  items,
  activeId,
  onTabChange,
  layoutId = 'motion-tab-indicator',
}: MotionTabBarProps) {
  return (
    <div className="flex gap-2 border-b border-[rgb(var(--border))]">
      {items.map((item) => {
        const ativo = item.id === activeId

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            className={[
              'relative -mb-px inline-flex items-center border-b-2 px-3 py-2 text-sm transition-colors',
              ativo
                ? 'border-transparent font-semibold text-[rgb(var(--color-primary-fg))]'
                : 'border-transparent font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 && (
              <span className="ml-1.5 rounded-full bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[10px] font-semibold text-[rgb(var(--foreground-muted))]">
                {item.count}
              </span>
            )}
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
    </div>
  )
}
