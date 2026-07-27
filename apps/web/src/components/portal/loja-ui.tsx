'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { ShoppingBag } from 'lucide-react'
import { ProdutoCardImagem } from '@/components/portal/produto-card-imagem'
import type { LojaProdutoCard } from '@/lib/loja-serialize'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

export function SacolaBadge({ count }: { count: number }) {
  return (
    <m.div whileTap={{ scale: 0.96 }} transition={springSnappy} className="min-w-0">
      <Link
        href="/portal/loja/sacola"
        className="relative inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[rgb(var(--foreground-muted)_/_0.4)] px-3 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--background-subtle))] sm:w-auto sm:px-4"
      >
        <ShoppingBag className="h-4 w-4 shrink-0" />
        Sacola
        {count > 0 && (
          <m.span
            layout
            className="rounded-full bg-[rgb(var(--primary))] px-1.5 py-0.5 text-xs font-bold text-white"
          >
            {count}
          </m.span>
        )}
      </Link>
    </m.div>
  )
}

export function PromoBadge({ percentual }: { percentual: number }) {
  if (percentual <= 0) return null
  return (
    <span className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
      {percentual}% OFF
    </span>
  )
}

export function LojaCarrossel({ produtos }: { produtos: LojaProdutoCard[] }) {
  if (produtos.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Lançamentos</h2>
      <m.div variants={staggerContainer} initial="hidden" animate="show" className="app-scrollbar-none flex gap-4 overflow-x-auto pb-2 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {produtos.map((p) => (
          <m.div key={p.id} variants={staggerItem} whileTap={{ scale: 0.97 }} transition={springSnappy} className="snap-start shrink-0">
            <Link
              href={p.href}
              className="block w-44 overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] transition-shadow hover:shadow-md sm:w-56"
            >
            <ProdutoCardImagem imagensUrl={p.imagensUrl} alt={p.nome} />
            <div className="p-3">
              <p className="line-clamp-2 text-sm font-medium">{p.nome}</p>
              <p className="mt-1 text-sm font-bold text-[rgb(var(--color-primary-fg))]">
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
