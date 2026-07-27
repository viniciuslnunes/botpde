'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { ProdutoCardImagem } from '@/components/portal/produto-card-imagem'
import { PromoBadge } from '@/components/portal/loja-ui'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

export interface LojaProdutoGridItem {
  id: string
  nome: string
  href: string
  precoLabel: string
  precoOriginalLabel: string | null
  imagensUrl: string[]
  esgotado: boolean
  descontoPct: number | null
}

interface LojaProdutoGridAnimatedProps {
  produtos: LojaProdutoGridItem[]
  emptyTitle?: string
  emptyDescription?: string
}

export function LojaProdutoGridAnimated({
  produtos,
  emptyTitle = 'Nenhum produto encontrado',
  emptyDescription = 'Tente outros filtros.',
}: LojaProdutoGridAnimatedProps) {
  if (produtos.length === 0) {
    return (
      <MotionEmptyState
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-20 text-center"
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }

  return (
    <m.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
    >
      {produtos.map((p) => (
        <m.div key={p.id} variants={staggerItem} whileTap={{ scale: 0.98 }} transition={springSnappy}>
          <Link
            href={p.href}
            className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] transition-all hover:shadow-md"
          >
            <div className="relative shrink-0">
              {p.descontoPct != null && p.descontoPct > 0 && <PromoBadge percentual={p.descontoPct} />}
              <ProdutoCardImagem imagensUrl={p.imagensUrl} alt={p.nome} />
            </div>
            <div className="flex flex-1 flex-col p-4">
              <h3 className="flex-1 font-semibold leading-snug line-clamp-2 group-hover:text-[rgb(var(--color-primary-fg))]">
                {p.nome}
              </h3>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  {p.precoOriginalLabel && (
                    <span className="block text-sm text-[rgb(var(--foreground-muted))] line-through">
                      {p.precoOriginalLabel}
                    </span>
                  )}
                  <span className="text-lg font-bold text-[rgb(var(--color-primary-fg))]">{p.precoLabel}</span>
                </div>
                {p.esgotado && (
                  <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                    Esgotado
                  </span>
                )}
              </div>
            </div>
          </Link>
        </m.div>
      ))}
    </m.div>
  )
}
