'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

/**
 * Segmented control "Descobrir / Seguindo" no topo do feed, no padrão social.
 * Descobrir = stream sugerido da torcida; Seguindo = só quem o membro segue.
 * O estado é derivado do searchParam `filtro`, lido no server pela posts-section.
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
          <Link
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
            <span
              className={[
                'absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-all duration-200',
                ativo ? 'bg-[rgb(var(--primary))]' : 'bg-transparent',
              ].join(' ')}
            />
          </Link>
        )
      })}
    </nav>
  )
}
