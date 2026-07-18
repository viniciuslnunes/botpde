'use client'

import { useSearchParams } from 'next/navigation'
import { m } from 'motion/react'
import { springSnappy } from '@/lib/motion-presets'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'

/**
 * Segmented control "Descobrir / Seguindo" no topo do feed, no padrão social.
 */
export function ComunidadeFeedTabs() {
  const params = useSearchParams()
  const filtro = params.get('filtro') === 'seguindo' ? 'seguindo' : 'descobrir'

  const tabs = [
    { id: 'descobrir', label: 'Descobrir', href: '/portal/comunidade' },
    { id: 'seguindo', label: 'Seguindo', href: '/portal/comunidade?filtro=seguindo' },
  ] as const

  return (
    <nav className="relative flex items-center gap-6 border-b border-[rgb(var(--border))]">
      {tabs.map((tab) => {
        const ativo = tab.id === filtro
        return (
          <ComunidadePrefetchLink
            key={tab.id}
            href={tab.href}
            scroll={false}
            aria-current={ativo ? 'page' : undefined}
            className={[
              'relative -mb-px pb-3 pt-1 text-[15px] font-semibold transition-colors',
              ativo
                ? 'text-[rgb(var(--foreground))]'
                : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {tab.label}
            {ativo && (
              <m.span
                layoutId="comunidade-feed-tab-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[rgb(var(--primary))]"
                transition={springSnappy}
              />
            )}
          </ComunidadePrefetchLink>
        )
      })}
    </nav>
  )
}
