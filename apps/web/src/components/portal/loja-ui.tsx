'use client'

import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { ProdutoCardImagem } from '@/components/portal/produto-card-imagem'
import type { LojaProdutoCard } from '@/lib/loja-serialize'

export function SacolaBadge({ count }: { count: number }) {
  return (
    <Link
      href="/portal/loja/sacola"
      className="relative flex items-center gap-2 rounded-xl border border-[rgb(var(--foreground-muted)_/_0.4)] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--background-subtle))]"
    >
      <ShoppingBag className="h-4 w-4" />
      Sacola
      {count > 0 && (
        <span className="rounded-full bg-[rgb(var(--primary))] px-1.5 py-0.5 text-xs font-bold text-white">
          {count}
        </span>
      )}
    </Link>
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
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
        {produtos.map((p) => (
          <Link
            key={p.id}
            href={`/portal/loja/${p.id}`}
            className="snap-start shrink-0 w-56 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] overflow-hidden hover:shadow-md transition-shadow"
          >
            <ProdutoCardImagem imagensUrl={p.imagensUrl} alt={p.nome} />
            <div className="p-3">
              <p className="font-medium text-sm line-clamp-2">{p.nome}</p>
              <p className="mt-1 text-sm font-bold text-[rgb(var(--primary))]">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(p.preco))}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
