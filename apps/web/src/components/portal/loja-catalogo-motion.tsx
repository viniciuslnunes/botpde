'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { springSnappy } from '@/lib/motion-presets'

interface LojaCategoriaChip {
  slug: string
  nome: string
  href: string
  active: boolean
}

export function LojaCategoriaChips({ chips }: { chips: LojaCategoriaChip[] }) {
  return (
    <div className="app-scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
      {chips.map((chip) => (
        <m.div key={chip.slug} whileTap={{ scale: 0.96 }} transition={springSnappy} className="shrink-0">
          <Link
            href={chip.href}
            className={`inline-flex whitespace-nowrap border px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] ${
              chip.active
                ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)_/_0.1)] text-[rgb(var(--color-primary-fg))]'
                : 'border-[rgb(var(--foreground-muted)_/_0.35)] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--primary)_/_0.5)]'
            }`}
          >
            [ {chip.nome} ]
          </Link>
        </m.div>
      ))}
    </div>
  )
}

interface LojaPaginacaoProps {
  page: number
  totalPages: number
  prevHref: string | null
  nextHref: string | null
}

export function LojaPaginacao({ page, totalPages, prevHref, nextHref }: LojaPaginacaoProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-4 pt-6">
      {prevHref && (
        <m.div whileTap={{ scale: 0.96 }} transition={springSnappy}>
          <Link
            href={prevHref}
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-[rgb(var(--foreground-muted))] underline-offset-4 hover:text-[rgb(var(--foreground))] hover:underline"
          >
            ← Anterior
          </Link>
        </m.div>
      )}
      <m.span layout className="font-mono text-[11px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
        {page} / {totalPages}
      </m.span>
      {nextHref && (
        <m.div whileTap={{ scale: 0.96 }} transition={springSnappy}>
          <Link
            href={nextHref}
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-[rgb(var(--foreground-muted))] underline-offset-4 hover:text-[rgb(var(--foreground))] hover:underline"
          >
            Próxima →
          </Link>
        </m.div>
      )}
    </div>
  )
}
