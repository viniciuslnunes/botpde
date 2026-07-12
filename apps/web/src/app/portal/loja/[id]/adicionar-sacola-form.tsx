'use client'

import { useActionState, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { adicionarAoCarrinho } from '../actions'
import { ShoppingBag, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { chaveTamanho } from '@torcida/types'
import { MotionSuccessPanel } from '@/components/motion/motion-success-panel'
import { springSnappy } from '@/lib/motion-presets'

type Produto = {
  id: string
  tamanhos: string[]
  estoque: Record<string, number>
}

export function AdicionarSacolaForm({ produto }: { produto: Produto }) {
  const [state, action, pending] = useActionState(adicionarAoCarrinho, {})
  const [tamanhoSel, setTamanhoSel] = useState<string>(produto.tamanhos[0] ?? '')

  const semTamanho = produto.tamanhos.length === 0
  const chave = semTamanho ? 'UN' : chaveTamanho(tamanhoSel)
  const estoqueDisponivel = produto.estoque[chave] ?? 0
  const esgotado = estoqueDisponivel === 0

  return (
    <AnimatePresence mode="wait">
      {state.success ? (
        <MotionSuccessPanel
          key="success"
          icon={<CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />}
          title="Adicionado à sacola!"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-800 dark:bg-emerald-950"
        >
          <div className="mt-4 flex gap-3 justify-center flex-wrap">
            <Link
              href="/portal/loja/sacola"
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Ver sacola
            </Link>
            <Link
              href="/portal/loja"
              className="rounded-xl border border-[rgb(var(--foreground-muted)_/_0.4)] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--background-subtle))]"
            >
              Continuar comprando
            </Link>
          </div>
        </MotionSuccessPanel>
      ) : (
        <m.form
          key="form"
          action={action}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={springSnappy}
          className="space-y-4"
        >
          <input type="hidden" name="produtoId" value={produto.id} />

          {!semTamanho && (
            <div>
              <label className="block text-sm font-semibold text-[rgb(var(--foreground))]">Tamanho</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {produto.tamanhos.map((t) => {
                  const qtd = produto.estoque[t] ?? 0
                  const disabled = qtd === 0
                  return (
                    <m.button
                      key={t}
                      type="button"
                      disabled={disabled}
                      onClick={() => setTamanhoSel(t)}
                      whileTap={disabled ? undefined : { scale: 0.95 }}
                      transition={springSnappy}
                      className={[
                        'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                        disabled
                          ? 'cursor-not-allowed border-[rgb(var(--foreground-muted)_/_0.25)] text-[rgb(var(--foreground-muted))] opacity-40'
                          : tamanhoSel === t
                            ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))] text-white'
                            : 'border-[rgb(var(--foreground-muted)_/_0.4)] text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))] hover:bg-[rgb(var(--primary)_/_0.08)]',
                      ].join(' ')}
                    >
                      {t}
                    </m.button>
                  )
                })}
              </div>
              <input type="hidden" name="tamanho" value={tamanhoSel} />
            </div>
          )}

          {!esgotado && (
            <div>
              <label htmlFor="qtd" className="block text-sm font-semibold text-[rgb(var(--foreground))]">
                Quantidade
                <span className="ml-1 font-normal text-[rgb(var(--foreground-muted))]">
                  (máx. {Math.min(estoqueDisponivel, 10)})
                </span>
              </label>
              <input
                id="qtd"
                name="quantidade"
                type="number"
                min="1"
                max={Math.min(estoqueDisponivel, 10)}
                defaultValue="1"
                className="mt-1 w-24 rounded-lg border border-[rgb(var(--foreground-muted)_/_0.35)] bg-[rgb(var(--background))] px-3 py-2 text-sm focus:border-[rgb(var(--primary))] focus:outline-none"
              />
            </div>
          )}

          <AnimatePresence>
            {state.error && (
              <m.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400"
              >
                {state.error}
              </m.p>
            )}
          </AnimatePresence>

          <m.button
            type="submit"
            disabled={pending || esgotado}
            whileTap={{ scale: pending || esgotado ? 1 : 0.98 }}
            transition={springSnappy}
            className={[
              'flex w-full items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-semibold transition-all',
              esgotado
                ? 'cursor-not-allowed border-[rgb(var(--foreground-muted)_/_0.25)] bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]'
                : 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))] text-white shadow-sm hover:opacity-90 disabled:opacity-50',
            ].join(' ')}
          >
            <ShoppingBag className="h-4 w-4" />
            {pending ? 'Adicionando...' : esgotado ? 'Produto esgotado' : 'Adicionar à sacola'}
          </m.button>
        </m.form>
      )}
    </AnimatePresence>
  )
}
