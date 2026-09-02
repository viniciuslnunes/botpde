'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ScrollRail } from '@/components/ui/scroll-rail'

export type LojaNavCategoria = {
  slug: string
  nome: string
}

export function LojaChromeNav({
  tenantId,
  categorias,
}: {
  tenantId: string
  categorias: LojaNavCategoria[]
}) {
  const sp = useSearchParams()
  const ativa = sp.get('categoria')

  if (categorias.length === 0) return null

  const chips = [
    { slug: 'todos', nome: 'Todos', href: `/portal/loja/${tenantId}`, active: !ativa },
    ...categorias.map((c) => ({
      slug: c.slug,
      nome: c.nome,
      href: `/portal/loja/${tenantId}?categoria=${c.slug}`,
      active: ativa === c.slug,
    })),
  ]

  return (
    <ScrollRail
      as="nav"
      aria-label="Categorias da loja"
      className="-mx-1 flex gap-1 border-t border-[rgb(var(--border)_/_0.55)] px-1 pt-2"
    >
      {chips.map((chip) => (
        <Link
          key={chip.slug}
          href={chip.href}
          className={[
            'shrink-0 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors',
            chip.active
              ? 'text-[rgb(var(--color-primary-fg))] underline decoration-[rgb(var(--color-primary))] decoration-2 underline-offset-4'
              : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
          ].join(' ')}
        >
          [ {chip.nome} ]
        </Link>
      ))}
    </ScrollRail>
  )
}
