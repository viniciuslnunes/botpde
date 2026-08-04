'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { ShoppingBag } from 'lucide-react'
import { ProdutoCardImagem } from '@/components/portal/produto-card-imagem'
import type { LojaProdutoCard } from '@/lib/loja-serialize'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

export function SacolaBadge({
  count,
  lojasCount,
  variant = 'default',
}: {
  count: number
  /** Quando > 1, hint de sacola multi-loja no badge. */
  lojasCount?: number
  variant?: 'default' | 'minimal'
}) {
  const label =
    lojasCount && lojasCount > 1 ? `${count}·${lojasCount}` : String(count)
  const title =
    lojasCount && lojasCount > 1 ? `${count} itens · ${lojasCount} lojas` : undefined

  if (variant === 'minimal') {
    return (
      <m.div whileTap={{ scale: 0.96 }} transition={springSnappy}>
        <Link
          href="/portal/loja/sacola"
          aria-label={count > 0 ? `Sacola (${label})` : 'Sacola'}
          title={title}
          className="relative inline-flex h-9 w-9 items-center justify-center text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          <ShoppingBag className="h-4 w-4" />
          {count > 0 && (
            <m.span
              layout
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center bg-[rgb(var(--primary))] px-1 font-mono text-[9px] font-bold text-[rgb(var(--color-primary-on))]"
            >
              {label}
            </m.span>
          )}
        </Link>
      </m.div>
    )
  }

  return (
    <m.div whileTap={{ scale: 0.96 }} transition={springSnappy} className="min-w-0">
      <Link
        href="/portal/loja/sacola"
        className="relative inline-flex h-10 w-full items-center justify-center gap-2 border border-[rgb(var(--foreground-muted)_/_0.35)] px-3 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--background-subtle))] sm:w-auto sm:px-4"
      >
        <ShoppingBag className="h-4 w-4 shrink-0" />
        Sacola
        {count > 0 && (
          <m.span
            layout
            className="bg-[rgb(var(--primary))] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[rgb(var(--color-primary-on))]"
            title={title}
          >
            {label}
          </m.span>
        )}
      </Link>
    </m.div>
  )
}

export function PromoBadge({ percentual }: { percentual: number }) {
  if (percentual <= 0) return null
  return (
    <span className="pointer-events-none absolute left-3 top-3 z-20 bg-red-600 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
      −{percentual}%
    </span>
  )
}

export function LojaCarrossel({ produtos }: { produtos: LojaProdutoCard[] }) {
  if (produtos.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[rgb(var(--foreground-muted))]">
          [ Lançamentos ]
        </p>
      </div>
      <m.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="app-scrollbar-none flex gap-3 overflow-x-auto pb-1 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {produtos.map((p) => (
          <m.div key={p.id} variants={staggerItem} whileTap={{ scale: 0.97 }} transition={springSnappy} className="snap-start shrink-0">
            <Link
              href={p.href}
              className="group block w-40 overflow-hidden bg-[rgb(var(--color-primary)_/_0.05)] transition-colors hover:bg-[rgb(var(--color-primary)_/_0.1)] sm:w-48 [clip-path:polygon(0_0,calc(100%-10px)_0,100%_10px,100%_100%,10px_100%,0_calc(100%-10px))]"
            >
              <ProdutoCardImagem imagensUrl={p.imagensUrl} alt={p.nome} />
              <div className="space-y-1 p-2.5">
                <p className="line-clamp-2 text-xs font-bold uppercase tracking-wide">{p.nome}</p>
                <p className="font-mono text-xs font-bold tabular-nums text-[rgb(var(--color-primary-fg))]">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(p.preco))}
                </p>
              </div>
            </Link>
          </m.div>
        ))}
      </m.div>
    </section>
  )
}
