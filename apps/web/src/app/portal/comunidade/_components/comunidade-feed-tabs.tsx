'use client'

import { useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { m } from 'motion/react'
import { springSnappy } from '@/lib/motion-presets'
import { ComunidadePrefetchLink } from '@/components/portal/comunidade-prefetch-link'

type FiltroTab = 'descobrir' | 'seguindo' | 'grupos'

function hrefComFiltro(
  escopo: 'nacional' | 'torcida',
  modoContexto: 'nacional' | 'torcida',
  filtro: FiltroTab,
): string {
  const params = new URLSearchParams()
  if (escopo !== modoContexto) params.set('escopo', escopo)
  if (filtro === 'seguindo') params.set('filtro', 'seguindo')
  if (filtro === 'grupos') params.set('filtro', 'grupos')
  const qs = params.toString()
  return qs ? `/portal/comunidade?${qs}` : '/portal/comunidade'
}

/**
 * Segmented control "Descobrir / Seguindo / Meus grupos" no topo do feed.
 * Preserva o escopo ativo (Nacional × Minha torcida) ao alternar abas.
 */
export function ComunidadeFeedTabs({
  escopo = 'torcida',
  modoContexto = 'torcida',
}: {
  escopo?: 'nacional' | 'torcida'
  modoContexto?: 'nacional' | 'torcida'
}) {
  const params = useSearchParams()
  const filtroRaw = params.get('filtro')
  const filtro: FiltroTab =
    filtroRaw === 'seguindo' ? 'seguindo' : filtroRaw === 'grupos' ? 'grupos' : 'descobrir'

  const tabs = useMemo(
    () =>
      [
        { id: 'descobrir' as const, label: 'Descobrir', href: hrefComFiltro(escopo, modoContexto, 'descobrir') },
        { id: 'seguindo' as const, label: 'Seguindo', href: hrefComFiltro(escopo, modoContexto, 'seguindo') },
        { id: 'grupos' as const, label: 'Meus grupos', href: hrefComFiltro(escopo, modoContexto, 'grupos') },
      ] as const,
    [escopo, modoContexto],
  )

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
