'use client'

import { useMemo, useState } from 'react'
import { m } from 'motion/react'
import { Beer } from 'lucide-react'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { ScrollRail } from '@/components/ui/scroll-rail'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

export type BarCardapioItem = {
  id: string
  nome: string
  descricao: string | null
  preco: number
  imagemUrl: string | null
  destaque: boolean
  estoque: number
  categoria: { id: string; nome: string } | null
}

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

export function BarCardapio({
  produtos,
  categorias,
}: {
  produtos: BarCardapioItem[]
  categorias: { id: string; nome: string }[]
}) {
  const [categoriaId, setCategoriaId] = useState<string | null>(null)

  const filtrados = useMemo(() => {
    if (!categoriaId) return produtos
    return produtos.filter((p) => p.categoria?.id === categoriaId)
  }, [produtos, categoriaId])

  if (produtos.length === 0) {
    return (
      <MotionEmptyState
        icon={<Beer className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
        title="Cardápio vazio"
        description="O bar ainda não publicou produtos. Volte em breve."
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center"
      />
    )
  }

  return (
    <div className="space-y-4">
      {categorias.length > 0 && (
        <ScrollRail className="flex gap-2 pb-1">
          <button
            type="button"
            onClick={() => setCategoriaId(null)}
            className={[
              'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              categoriaId == null
                ? 'bg-[rgb(var(--primary))] text-primary-on'
                : 'border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            Todos
          </button>
          {categorias.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoriaId(c.id)}
              className={[
                'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                categoriaId === c.id
                  ? 'bg-[rgb(var(--primary))] text-primary-on'
                  : 'border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground))]',
              ].join(' ')}
            >
              {c.nome}
            </button>
          ))}
        </ScrollRail>
      )}

      {filtrados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Nenhum item nesta categoria.
        </p>
      ) : (
        <m.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filtrados.map((p) => {
            const esgotado = p.estoque <= 0
            return (
              <m.article
                key={p.id}
                variants={staggerItem}
                transition={springSnappy}
                className={[
                  'overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
                  esgotado ? 'opacity-60' : '',
                ].join(' ')}
              >
                <ProdutoImagem src={p.imagemUrl} alt={p.nome} variant="admin" />
                <div className="space-y-1.5 p-4">
                  {p.destaque && !esgotado && (
                    <span className="text-xs font-medium text-[rgb(var(--color-warning-fg))]">
                      ★ Destaque
                    </span>
                  )}
                  <h3 className="font-semibold text-[rgb(var(--foreground))]">{p.nome}</h3>
                  {p.categoria && (
                    <p className="text-xs text-[rgb(var(--foreground-muted))]">{p.categoria.nome}</p>
                  )}
                  {p.descricao && (
                    <p className="line-clamp-2 text-sm text-[rgb(var(--foreground-muted))]">
                      {p.descricao}
                    </p>
                  )}
                  <div className="flex items-baseline justify-between gap-2 pt-1">
                    <span className="text-lg font-bold tabular-nums text-[rgb(var(--color-primary-fg))]">
                      {formatarPreco(p.preco)}
                    </span>
                    {esgotado && (
                      <span className="text-xs font-medium text-[rgb(var(--color-danger-fg))]">
                        Esgotado
                      </span>
                    )}
                  </div>
                </div>
              </m.article>
            )
          })}
        </m.div>
      )}
    </div>
  )
}
