'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { springSnappy } from '@/lib/motion-presets'

export type PerfilAba = 'sobre' | 'publicacoes' | 'fotos' | 'atividade'

interface PerfilTabsProps {
  userId: string
  abaAtiva: PerfilAba
}

const ABAS: { id: PerfilAba; label: string }[] = [
  { id: 'sobre', label: 'Sobre' },
  { id: 'publicacoes', label: 'Publicações' },
  { id: 'fotos', label: 'Fotos' },
  { id: 'atividade', label: 'Atividade' },
]

export function PerfilTabs({ userId, abaAtiva }: PerfilTabsProps) {
  return (
    <nav className="app-scrollbar-none flex gap-6 overflow-x-auto border-b border-[rgb(var(--border))] px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {ABAS.map((aba) => {
        const ativo = aba.id === abaAtiva
        return (
          <Link
            key={aba.id}
            href={`/portal/comunidade/perfil/${userId}?aba=${aba.id}`}
            aria-current={ativo ? 'page' : undefined}
            className={[
              'app-touch-target relative -mb-px shrink-0 pb-3 pt-1 text-sm font-semibold transition-colors',
              ativo
                ? 'text-[rgb(var(--foreground))]'
                : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            {aba.label}
            {ativo && (
              <m.span
                layoutId="perfil-tab-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[rgb(var(--primary))]"
                transition={springSnappy}
              />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
