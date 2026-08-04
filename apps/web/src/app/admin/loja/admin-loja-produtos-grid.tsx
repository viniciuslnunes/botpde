'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { Pencil } from 'lucide-react'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { ToggleProdutoButton } from '@/components/admin/produto-forms'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { ShoppingBag } from 'lucide-react'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

export interface AdminProdutoItem {
  id: string
  nome: string
  categoriaNome: string | null
  precoLabel: string
  estoqueLabel: string
  vendidos: number
  destaque: boolean
  ativo: boolean
  imagemUrl: string | null
}

function ProdutoCard({ produto }: { produto: AdminProdutoItem }) {
  return (
    <m.div
      variants={staggerItem}
      whileTap={{ scale: 0.99 }}
      transition={springSnappy}
      className={[
        'rounded-2xl border overflow-hidden',
        produto.ativo
          ? 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]'
          : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-70',
      ].join(' ')}
    >
      <ProdutoImagem src={produto.imagemUrl} alt={produto.nome} variant="admin" />
      <div className="p-4 space-y-3">
        <div>
          {produto.destaque && produto.ativo && (
            <span className="text-xs font-medium text-amber-600">★ Destaque</span>
          )}
          <h3 className="font-semibold">{produto.nome}</h3>
          {produto.categoriaNome && (
            <p className="text-xs text-[rgb(var(--foreground-muted))]">{produto.categoriaNome}</p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-[rgb(var(--color-primary-fg))]">{produto.precoLabel}</span>
          <span className="text-xs text-[rgb(var(--foreground-muted))]">{produto.vendidos} itens vendidos</span>
        </div>
        <p className="text-xs text-[rgb(var(--foreground-muted))]">Estoque: {produto.estoqueLabel}</p>
        <div className="flex items-center gap-2 pt-1">
          <Link
            href={`/admin/loja/${produto.id}`}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-[rgb(var(--background-subtle))]"
          >
            <Pencil className="h-3 w-3" /> Editar
          </Link>
          <ToggleProdutoButton id={produto.id} ativo={produto.ativo} />
        </div>
      </div>
    </m.div>
  )
}

export function AdminLojaProdutosGrid({
  ativos,
  inativos,
}: {
  ativos: AdminProdutoItem[]
  inativos: AdminProdutoItem[]
}) {
  if (ativos.length === 0 && inativos.length === 0) {
    return (
      <MotionEmptyState
        icon={<ShoppingBag className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
        title="Nenhum produto cadastrado"
        description="Crie o primeiro produto ou rode o seed Gaviões."
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16 text-center"
      />
    )
  }

  return (
    <div className="space-y-6">
      {ativos.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Ativos ({ativos.length})
          </h2>
          <m.div variants={staggerContainer} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ativos.map((p) => (
              <ProdutoCard key={p.id} produto={p} />
            ))}
          </m.div>
        </section>
      )}
      {inativos.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Inativos ({inativos.length})
          </h2>
          <m.div variants={staggerContainer} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inativos.map((p) => (
              <ProdutoCard key={p.id} produto={p} />
            ))}
          </m.div>
        </section>
      )}
    </div>
  )
}
