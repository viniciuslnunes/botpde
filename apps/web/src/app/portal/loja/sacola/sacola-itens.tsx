'use client'

import { useMemo, useState, useTransition } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { useRouter } from 'next/navigation'
import { atualizarItemCarrinho, removerDoCarrinho, adicionarAoCarrinho } from '../actions'
import Link from 'next/link'
import { Trash2, ArrowRight, ShoppingBag, Store } from 'lucide-react'
import { rotuloTamanho } from '@torcida/types'
import { toast } from '@torcida/ui'
import { ProdutoCardImagem } from '@/components/portal/produto-card-imagem'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { cartItemExit, springSnappy } from '@/lib/motion-presets'
import type { SacolaItemSerializado } from '@/lib/loja-serialize'
import { ContinuarComprandoLink, LojaCheckoutStepper } from '../_components/loja-fluxo'

function formatarPreco(preco: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preco)
}

export type SacolaLojaMeta = {
  tenantId: string
  nome: string
}

export function SacolaItens({
  itens: itensIniciais,
  lojas,
}: {
  itens: SacolaItemSerializado[]
  lojas: SacolaLojaMeta[]
}) {
  const router = useRouter()
  const [itens, setItens] = useState(itensIniciais)
  const [pending, startTransition] = useTransition()

  // Reconcilia com o servidor no render (o RSC revalida sem desmontar).
  const [itensSincronizados, setItensSincronizados] = useState(itensIniciais)
  if (itensIniciais !== itensSincronizados) {
    setItensSincronizados(itensIniciais)
    setItens(itensIniciais)
  }

  const lojaNome = useMemo(() => {
    const map = new Map(lojas.map((l) => [l.tenantId, l.nome]))
    return (tenantId: string) => map.get(tenantId) ?? 'Loja'
  }, [lojas])

  const grupos = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, SacolaItemSerializado[]>()
    for (const item of itens) {
      const tid = item.produto.tenantId
      if (!map.has(tid)) {
        map.set(tid, [])
        order.push(tid)
      }
      map.get(tid)!.push(item)
    }
    return order.map((tenantId) => ({
      tenantId,
      nome: lojaNome(tenantId),
      itens: map.get(tenantId)!,
      subtotal: map.get(tenantId)!.reduce((acc, i) => acc + i.produto.preco * i.quantidade, 0),
    }))
  }, [itens, lojaNome])

  const subtotal = itens.reduce((acc, i) => acc + i.produto.preco * i.quantidade, 0)
  const totalItens = itens.reduce((acc, i) => acc + i.quantidade, 0)

  function remover(item: SacolaItemSerializado) {
    startTransition(async () => {
      const result = await removerDoCarrinho(item.id)
      if (result?.error) {
        toast.error(result.error)
        return
      }

      setItens((prev) => prev.filter((i) => i.id !== item.id))

      toast.message('Item removido da sacola.', {
        id: `sacola-rm-${item.id}`,
        description: item.produto.nome,
        duration: 8000,
        action: {
          label: 'Desfazer',
          onClick: (event) => {
            event.preventDefault()
            startTransition(async () => {
              const fd = new FormData()
              fd.append('produtoId', item.produto.id)
              if (item.tamanho && item.tamanho !== 'UN') {
                fd.append('tamanho', item.tamanho)
              }
              fd.append('quantidade', String(item.quantidade))
              const res = await adicionarAoCarrinho({}, fd)
              if (res.error) {
                toast.error(res.error, { id: `sacola-rm-${item.id}` })
                return
              }
              toast.success('Item devolvido à sacola.', {
                id: `sacola-rm-${item.id}`,
                description: item.produto.nome,
              })
              router.refresh()
            })
          },
        },
      })
    })
  }

  if (itens.length === 0) {
    return (
      <div className="space-y-6">
        <LojaCheckoutStepper atual="sacola" />
        <MotionEmptyState
          icon={<ShoppingBag className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
          title="Sua sacola está vazia"
          description={
            <>
              Explore o catálogo e adicione produtos.
              <ContinuarComprandoLink className="mt-5 inline-flex bg-[rgb(var(--primary))] px-5 py-2.5 text-sm font-semibold text-[rgb(var(--color-primary-on))] hover:opacity-90">
                Ir à loja
              </ContinuarComprandoLink>
            </>
          }
          className="border border-dashed border-[rgb(var(--foreground-muted)_/_0.3)] py-16 text-center"
        />
      </div>
    )
  }

  // A folga de baixo cobre a barra fixa de checkout (só existe no mobile).
  // Ela cresce com o inset inferior, então a folga cresce junto — senão o
  // último item da sacola fica atrás do CTA no iPhone.
  return (
    <div className="space-y-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pb-8">
      <LojaCheckoutStepper atual="sacola" lojasCount={grupos.length} />

      <div className="space-y-5">
        {grupos.map((grupo) => (
          <section key={grupo.tenantId} className="space-y-2">
            <div className="flex items-center justify-between gap-3 px-1">
              <Link
                href={`/portal/loja/${grupo.tenantId}`}
                className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground))] hover:text-[rgb(var(--color-primary-fg))]"
              >
                <Store className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
                <span className="truncate">{grupo.nome}</span>
              </Link>
              <span className="shrink-0 font-mono text-xs tabular-nums text-[rgb(var(--foreground-muted))]">
                {formatarPreco(grupo.subtotal)}
              </span>
            </div>

            <ul className="divide-y divide-[rgb(var(--border)_/_0.7)] border border-[rgb(var(--border)_/_0.7)] bg-[rgb(var(--surface))]">
              <AnimatePresence mode="popLayout" initial={false}>
                {grupo.itens.map((item) => (
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
                      href={`/portal/loja/${item.produto.tenantId}/${item.produto.id}`}
                      className="h-24 w-24 shrink-0 overflow-hidden bg-[rgb(var(--background-subtle))]"
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
                            href={`/portal/loja/${item.produto.tenantId}/${item.produto.id}`}
                            className="font-semibold uppercase tracking-wide leading-snug hover:text-[rgb(var(--color-primary-fg))] line-clamp-2"
                          >
                            {item.produto.nome}
                          </Link>
                          <p className="mt-0.5 font-mono text-xs text-[rgb(var(--foreground-muted))]">
                            {rotuloTamanho(item.tamanho) ? `Tam. ${rotuloTamanho(item.tamanho)} · ` : ''}
                            {formatarPreco(item.produto.preco)} cada
                          </p>
                        </div>
                        <p className="shrink-0 font-mono text-sm font-bold tabular-nums">
                          {formatarPreco(item.produto.preco * item.quantidade)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={item.quantidade}
                          disabled={pending}
                          aria-label={`Quantidade de ${item.produto.nome}`}
                          onChange={(e) => {
                            const qtd = Number(e.target.value)
                            setItens((prev) =>
                              prev.map((i) => (i.id === item.id ? { ...i, quantidade: qtd } : i)),
                            )
                            startTransition(async () => {
                              const result = await atualizarItemCarrinho(item.id, qtd)
                              if (result?.error) {
                                toast.error(result.error)
                                router.refresh()
                              }
                            })
                          }}
                          className="border border-[rgb(var(--foreground-muted)_/_0.35)] bg-[rgb(var(--background))] px-2.5 py-1.5 font-mono text-sm focus:border-[rgb(var(--primary))] focus:outline-none"
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
                          onClick={() => remover(item)}
                          whileTap={{ scale: 0.9 }}
                          transition={springSnappy}
                          className="app-touch-target border border-[rgb(var(--foreground-muted)_/_0.25)] p-2 text-red-500 hover:border-red-400/50 hover:bg-red-500/10"
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
          </section>
        ))}
      </div>

      {/* Desktop summary */}
      <div className="hidden space-y-4 border-t border-[rgb(var(--border))] pt-5 sm:block">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[rgb(var(--foreground-muted))]">
            Subtotal · {totalItens} itens
          </span>
          <m.span layout className="font-mono text-xl font-bold tabular-nums text-[rgb(var(--color-primary-fg))]">
            {formatarPreco(subtotal)}
          </m.span>
        </div>
        <div className="flex flex-wrap gap-3">
          <ContinuarComprandoLink className="inline-flex items-center justify-center border border-[rgb(var(--border))] px-5 py-3 text-sm font-medium hover:border-[rgb(var(--primary))]">
            Continuar comprando
          </ContinuarComprandoLink>
          <m.div whileTap={{ scale: 0.98 }} transition={springSnappy} className="min-w-0 flex-1 sm:flex-none">
            <Link
              href="/portal/loja/checkout"
              className="flex w-full items-center justify-center gap-2 bg-[rgb(var(--primary))] px-6 py-3.5 text-sm font-semibold text-[rgb(var(--color-primary-on))] hover:opacity-90 sm:min-w-[240px]"
            >
              Ir ao checkout
              <ArrowRight className="h-4 w-4" />
            </Link>
          </m.div>
        </div>
      </div>

      {/* Mobile sticky bar */}
      {/* `p-3` sozinho jogava o botão de checkout embaixo do home indicator do
          iPhone (34px). O inset entra só no padding de baixo. */}
      <div className="app-inset-x fixed inset-x-0 bottom-0 z-40 border-t border-[rgb(var(--border))] bg-[rgb(var(--background)_/_0.92)] pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md [--app-inset-x:0.75rem] sm:hidden">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
            {totalItens} itens
            {grupos.length > 1 ? ` · ${grupos.length} lojas` : ''}
          </span>
          <span className="font-mono text-base font-bold tabular-nums text-[rgb(var(--color-primary-fg))]">
            {formatarPreco(subtotal)}
          </span>
        </div>
        <Link
          href="/portal/loja/checkout"
          className="flex w-full items-center justify-center gap-2 bg-[rgb(var(--primary))] py-3.5 text-sm font-semibold text-[rgb(var(--color-primary-on))]"
        >
          Ir ao checkout
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
