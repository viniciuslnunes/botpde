'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { Beer, Pencil } from 'lucide-react'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import {
  ExcluirProdutoBarButton,
  ToggleProdutoBarButton,
} from '@/components/admin/bar/bar-produto-forms'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import type { BarProdutoSerializado } from '@/lib/bar-serialize'

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function estoqueBaixo(p: BarProdutoSerializado): boolean {
  return p.estoqueMinimo != null && p.estoque <= p.estoqueMinimo
}

function ProdutoBarCard({ produto }: { produto: BarProdutoSerializado }) {
  const baixo = estoqueBaixo(produto)

  return (
    <m.div
      variants={staggerItem}
      whileTap={{ scale: 0.99 }}
      transition={springSnappy}
      className={[
        'overflow-hidden rounded-2xl border',
        produto.ativo
          ? 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]'
          : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-70',
      ].join(' ')}
    >
      <ProdutoImagem
        src={produto.imagemUrl}
        alt={produto.nome}
        variant="admin"
        className={produto.ativo ? undefined : 'h-32'}
      />
      <div className="space-y-3 p-4">
        <div>
          {produto.destaque && produto.ativo && (
            <span className="text-xs font-medium text-[rgb(var(--color-warning-fg))]">★ Destaque</span>
          )}
          <h3 className="font-semibold text-[rgb(var(--foreground))]">{produto.nome}</h3>
          {produto.categoria && (
            <p className="text-xs text-[rgb(var(--foreground-muted))]">{produto.categoria.nome}</p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-[rgb(var(--color-primary-fg))]">
            {formatarPreco(produto.preco)}
          </span>
          <span className="text-xs text-[rgb(var(--foreground-muted))]">
            Custo médio {formatarPreco(produto.custoMedio)}
          </span>
        </div>
        <p
          className={
            baixo
              ? 'text-xs font-medium text-[rgb(var(--color-warning-fg))]'
              : 'text-xs text-[rgb(var(--foreground-muted))]'
          }
        >
          Estoque: {produto.estoque} un.
          {produto.estoqueMinimo != null && ` · mínimo ${produto.estoqueMinimo}`}
          {baixo && ' · repor'}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link
            href={`/admin/bar/produtos/${produto.id}`}
            className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium hover:bg-[rgb(var(--background-subtle))]"
          >
            <Pencil className="h-3 w-3" /> Editar
          </Link>
          <ToggleProdutoBarButton id={produto.id} ativo={produto.ativo} />
          <ExcluirProdutoBarButton id={produto.id} nome={produto.nome} />
        </div>
      </div>
    </m.div>
  )
}

export function BarProdutosGrid({ produtos }: { produtos: BarProdutoSerializado[] }) {
  const ativos = produtos.filter((p) => p.ativo)
  const inativos = produtos.filter((p) => !p.ativo)

  if (produtos.length === 0) {
    return (
      <MotionEmptyState
        icon={<Beer className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
        title="Nenhum produto no bar"
        description="Cadastre o primeiro item do balcão — bebidas, comidas, gelo…"
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center"
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
          <m.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {ativos.map((p) => (
              <ProdutoBarCard key={p.id} produto={p} />
            ))}
          </m.div>
        </section>
      )}
      {inativos.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Inativos ({inativos.length})
          </h2>
          <m.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {inativos.map((p) => (
              <ProdutoBarCard key={p.id} produto={p} />
            ))}
          </m.div>
        </section>
      )}
    </div>
  )
}
