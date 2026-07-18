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
            className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium ${
              chip.active
                ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)_/_0.1)] text-[rgb(var(--color-primary-fg))]'
                : 'border-[rgb(var(--foreground-muted)_/_0.35)] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--primary)_/_0.5)]'
            }`}
          >
            {chip.nome}
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
    <div className="flex items-center justify-center gap-3 pt-4">
      {prevHref && (
        <m.div whileTap={{ scale: 0.96 }} transition={springSnappy}>
          <Link
            href={prevHref}
            className="rounded-full border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            Anterior
          </Link>
        </m.div>
      )}
      <m.span layout className="text-sm text-[rgb(var(--foreground-muted))]">
        Página {page} de {totalPages}
      </m.span>
      {nextHref && (
        <m.div whileTap={{ scale: 0.96 }} transition={springSnappy}>
          <Link
            href={nextHref}
            className="rounded-full border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            Próxima
          </Link>
        </m.div>
      )}
    </div>
  )
}
