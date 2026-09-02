'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { springSnappy } from '@/lib/motion-presets'
import { ScrollRail } from '@/components/ui/scroll-rail'

export type ForumAbaId = 'topicos' | 'novo' | 'ranking'

export function ForumAbas({
  items,
  ativa,
}: {
  items: { id: ForumAbaId; label: string; href: string }[]
  ativa: ForumAbaId
}) {
  return (
    <ScrollRail
      as="nav"
      aria-label="Seções do fórum"
      className="flex gap-5 border-b border-[rgb(var(--border))] px-1"
    >
      {items.map((item) => {
        const ativo = item.id === ativa
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={ativo ? 'page' : undefined}
            className={[
              'app-touch-target relative -mb-px shrink-0 pb-3 pt-1 text-sm font-semibold transition-colors',
              ativo
                ? 'text-[rgb(var(--foreground))]'
                : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {item.label}
            {ativo ? (
              <m.span
                layoutId="forum-tab-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[rgb(var(--primary))]"
                transition={springSnappy}
              />
            ) : null}
          </Link>
        )
      })}
    </ScrollRail>
  )
}
