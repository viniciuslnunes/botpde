'use client'

import { useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { atualizarItemCarrinho, removerDoCarrinho } from '../actions'
import Link from 'next/link'
import { Trash2, ArrowRight, ShoppingBag } from 'lucide-react'
import { rotuloTamanho } from '@torcida/types'
import { ProdutoCardImagem } from '@/components/portal/produto-card-imagem'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { cartItemExit, springSnappy } from '@/lib/motion-presets'
import type { SacolaItemSerializado } from '@/lib/loja-serialize'

function formatarPreco(preco: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preco)
}

export function SacolaItens({ itens: itensIniciais }: { itens: SacolaItemSerializado[] }) {
  const [itens, setItens] = useState(itensIniciais)
  const [pending, startTransition] = useTransition()

  const subtotal = itens.reduce((acc, i) => acc + i.produto.preco * i.quantidade, 0)

  function remover(id: string) {
    startTransition(async () => {
      await removerDoCarrinho(id)
      setItens((prev) => prev.filter((i) => i.id !== id))
    })
  }

  if (itens.length === 0) {
    return (
      <MotionEmptyState
        icon={<ShoppingBag className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
        title="Sua sacola está vazia"
        description={
          <>
            Explore a loja e adicione produtos.
            <Link
              href="/portal/loja"
              className="mt-5 inline-flex rounded-xl border-2 border-[rgb(var(--primary))] bg-[rgb(var(--primary))] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Ir à loja
            </Link>
          </>
        }
        className="rounded-2xl border-2 border-dashed border-[rgb(var(--foreground-muted)_/_0.3)] py-16 text-center"
      />
    )
  }

  return (
    <div className="space-y-6">
      <ul className="divide-y divide-[rgb(var(--foreground-muted)_/_0.15)] rounded-2xl border border-[rgb(var(--foreground-muted)_/_0.25)] bg-[rgb(var(--surface))]">
        <AnimatePresence mode="popLayout" initial={false}>
          {itens.map((item) => (
            <m.li
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit="exit"
              variants={cartItemExit}
              transition={springSnappy}
              className="flex gap-4 overflow-hidden p-4"
            >
              <Link
                href={`/portal/loja/${item.produto.id}`}
                className="h-24 w-24 shrink-0 overflow-hidden rounded-xl"
                aria-label={item.produto.nome}
              >
                <ProdutoCardImagem
                  imagensUrl={item.produto.imagensUrl}
                  alt={item.produto.nome}
                  className="h-24 w-24"
                />
              </Link>

              <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/portal/loja/${item.produto.id}`}
                      className="font-semibold leading-snug hover:text-[rgb(var(--primary))] line-clamp-2"
                    >
                      {item.produto.nome}
                    </Link>
                    <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
                      {rotuloTamanho(item.tamanho) ? `Tamanho ${rotuloTamanho(item.tamanho)} · ` : ''}
                      {formatarPreco(item.produto.preco)} cada
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums">
                    {formatarPreco(item.produto.preco * item.quantidade)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    defaultValue={item.quantidade}
                    disabled={pending}
                    aria-label={`Quantidade de ${item.produto.nome}`}
                    onChange={(e) =>
                      startTransition(() => {
                        void atualizarItemCarrinho(item.id, Number(e.target.value))
                      })
                    }
                    className="rounded-lg border border-[rgb(var(--foreground-muted)_/_0.4)] bg-[rgb(var(--background))] px-2.5 py-1.5 text-sm focus:border-[rgb(var(--primary))] focus:outline-none"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <m.button
                    type="button"
                    disabled={pending}
                    onClick={() => remover(item.id)}
                    whileTap={{ scale: 0.9 }}
                    transition={springSnappy}
                    className="rounded-lg border border-[rgb(var(--foreground-muted)_/_0.3)] p-2 text-red-500 hover:border-red-400/50 hover:bg-red-500/10"
                    aria-label={`Remover ${item.produto.nome}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </m.button>
                </div>
              </div>
            </m.li>
          ))}
        </AnimatePresence>
      </ul>

      <m.div layout transition={springSnappy} className="space-y-4 border-t border-[rgb(var(--foreground-muted)_/_0.2)] pt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-base font-semibold">Subtotal</span>
          <m.span layout className="text-xl font-bold tabular-nums text-[rgb(var(--primary))]">
            {formatarPreco(subtotal)}
          </m.span>
        </div>
        <m.div whileTap={{ scale: 0.98 }} transition={springSnappy}>
          <Link
            href="/portal/loja/checkout"
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[rgb(var(--primary))] bg-[rgb(var(--primary))] py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90"
          >
            Finalizar pedido
            <ArrowRight className="h-4 w-4" />
          </Link>
        </m.div>
      </m.div>
    </div>
  )
}
