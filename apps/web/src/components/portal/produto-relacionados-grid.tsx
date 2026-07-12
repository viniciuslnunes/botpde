'use client'

import Link from 'next/link'
import { m } from 'motion/react'
import { ProdutoCardImagem } from '@/components/portal/produto-card-imagem'
import { springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'

export interface ProdutoRelacionadoItem {
  id: string
  nome: string
  precoLabel: string
  imagensUrl: string[]
}

export function ProdutoRelacionadosGrid({ produtos }: { produtos: ProdutoRelacionadoItem[] }) {
  if (produtos.length === 0) return null

  return (
    <m.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {produtos.map((p) => (
        <m.div key={p.id} variants={staggerItem} whileTap={{ scale: 0.98 }} transition={springSnappy}>
          <Link
            href={`/portal/loja/${p.id}`}
            className="group block overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:shadow-md"
          >
            <ProdutoCardImagem imagensUrl={p.imagensUrl} alt={p.nome} />
            <div className="p-3">
              <p className="text-sm font-medium line-clamp-2 group-hover:text-[rgb(var(--primary))]">{p.nome}</p>
              <p className="mt-1 text-sm font-bold text-[rgb(var(--primary))]">{p.precoLabel}</p>
            </div>
          </Link>
        </m.div>
      ))}
    </m.div>
  )
}
