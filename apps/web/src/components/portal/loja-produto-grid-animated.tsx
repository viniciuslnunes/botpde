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
  featured?: boolean
}

interface LojaProdutoGridAnimatedProps {
  produtos: LojaProdutoGridItem[]
  emptyTitle?: string
  emptyDescription?: string
}

const CLIP =
  '[clip-path:polygon(0_0,calc(100%-14px)_0,100%_14px,100%_100%,14px_100%,0_calc(100%-14px))]'

function ProdutoCard({ p }: { p: LojaProdutoGridItem }) {
  if (p.featured) {
    return (
      <Link
        href={p.href}
        className={`group relative flex h-full flex-col overflow-hidden bg-[rgb(var(--color-primary)_/_0.06)] transition-colors hover:bg-[rgb(var(--color-primary)_/_0.1)] sm:grid sm:grid-cols-2 ${CLIP}`}
      >
        <div className="relative shrink-0 bg-[rgb(var(--background-subtle))]">
          {p.descontoPct != null && p.descontoPct > 0 && <PromoBadge percentual={p.descontoPct} />}
          <ProdutoCardImagem imagensUrl={p.imagensUrl} alt={p.nome} className="sm:h-full sm:min-h-[240px]" />
        </div>
        <div className="flex flex-1 flex-col justify-end p-5 sm:p-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[rgb(var(--foreground-muted))]">
            [ Destaque ]
          </p>
          <h3 className="mt-3 text-xl font-black uppercase leading-[0.95] tracking-tight line-clamp-2 group-hover:text-[rgb(var(--color-primary-fg))] sm:text-2xl">
            {p.nome}
          </h3>
          <div className="mt-6 flex items-end justify-between gap-2 border-t border-[rgb(var(--border)_/_0.7)] pt-4">
            <div className="min-w-0">
              {p.precoOriginalLabel && (
                <span className="block font-mono text-xs text-[rgb(var(--foreground-muted))] line-through">
                  {p.precoOriginalLabel}
                </span>
              )}
              <span className="font-mono text-xl font-bold tabular-nums text-[rgb(var(--color-primary-fg))]">
                {p.precoLabel}
              </span>
            </div>
            {p.esgotado ? (
              <span className="font-mono text-[10px] uppercase tracking-wider text-red-500">Esgotado</span>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[rgb(var(--foreground-muted))] group-hover:text-[rgb(var(--color-primary-fg))]">
                Ver →
              </span>
            )}
          </div>
        </div>
      </Link>
    )
  }

  return (
    <Link
      href={p.href}
      className={`group relative flex h-full flex-col overflow-hidden bg-[rgb(var(--color-primary)_/_0.05)] transition-colors hover:bg-[rgb(var(--color-primary)_/_0.09)] ${CLIP}`}
    >
      <div className="relative shrink-0 bg-[rgb(var(--background-subtle))]">
        {p.descontoPct != null && p.descontoPct > 0 && <PromoBadge percentual={p.descontoPct} />}
        <ProdutoCardImagem imagensUrl={p.imagensUrl} alt={p.nome} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5 sm:p-4">
        <h3 className="flex-1 text-[13px] font-bold uppercase leading-snug tracking-wide line-clamp-2 group-hover:text-[rgb(var(--color-primary-fg))]">
          {p.nome}
        </h3>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            {p.precoOriginalLabel && (
              <span className="block font-mono text-[11px] text-[rgb(var(--foreground-muted))] line-through">
                {p.precoOriginalLabel}
              </span>
            )}
            <span className="font-mono text-sm font-bold tabular-nums text-[rgb(var(--color-primary-fg))]">
              {p.precoLabel}
            </span>
          </div>
          {p.esgotado && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-red-500">Esgotado</span>
          )}
        </div>
      </div>
    </Link>
  )
}

export function LojaProdutoGridAnimated({
  produtos,
  emptyTitle = 'Nenhum produto encontrado',
  emptyDescription = 'Tente outros filtros.',
}: LojaProdutoGridAnimatedProps) {
  if (produtos.length === 0) {
    return (
      <MotionEmptyState
        className="flex flex-col items-center justify-center border border-dashed border-[rgb(var(--border))] py-20 text-center"
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
      className="grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3"
    >
      {produtos.map((p) => (
        <m.div
          key={p.id}
          variants={staggerItem}
          whileTap={{ scale: 0.985 }}
          transition={springSnappy}
          className={p.featured ? 'sm:col-span-2' : undefined}
        >
          <ProdutoCard p={p} />
        </m.div>
      ))}
    </m.div>
  )
}
