'use client'

import { useActionState, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { adicionarAoCarrinho } from '../../actions'
import { ShoppingBag, CheckCircle2, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { chaveTamanho } from '@torcida/types'
import { MotionSuccessPanel } from '@/components/motion/motion-success-panel'
import { springSnappy } from '@/lib/motion-presets'
import { useActionStateToast } from '@/lib/toast-action'
import { ContinuarComprandoLink } from '../../_components/loja-fluxo'

type Produto = {
  id: string
  tamanhos: string[]
  estoque: Record<string, number>
  precoLabel: string
  precoOriginalLabel: string | null
}

export function AdicionarSacolaForm({ produto }: { produto: Produto }) {
  const [state, action, pending] = useActionState(adicionarAoCarrinho, {})
  const [tamanhoSel, setTamanhoSel] = useState<string>(produto.tamanhos[0] ?? '')
  useActionStateToast(state, pending, 'Adicionado à sacola!', {
    id: 'loja-add-sacola',
    action: {
      label: 'Ver sacola',
      onClick: () => {
        window.location.href = '/portal/loja/sacola'
      },
    },
  })

  const semTamanho = produto.tamanhos.length === 0
  const chave = semTamanho ? 'UN' : chaveTamanho(tamanhoSel)
  const estoqueDisponivel = produto.estoque[chave] ?? 0
  const esgotado = estoqueDisponivel === 0

  return (
    <AnimatePresence mode="wait">
      {state.success ? (
        <MotionSuccessPanel
          key="success"
          icon={<CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--color-primary-fg))]" />}
          title="Adicionado à sacola!"
          className="border border-[rgb(var(--border))] bg-[rgb(var(--color-primary)_/_0.08)] p-6 text-center"
        >
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link
              href="/portal/loja/sacola"
              className="inline-flex items-center gap-2 bg-[rgb(var(--primary))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-primary-on))] hover:opacity-90"
            >
              Ver sacola
              <ArrowRight className="h-4 w-4" />
            </Link>
            <ContinuarComprandoLink className="border border-[rgb(var(--foreground-muted)_/_0.35)] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))]">
              Continuar nesta loja
            </ContinuarComprandoLink>
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
          className="space-y-6"
        >
          <input type="hidden" name="produtoId" value={produto.id} />

          {!semTamanho && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[rgb(var(--foreground-muted))]">
                [ Size ]
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {produto.tamanhos.map((t) => {
                  const qtd = produto.estoque[t] ?? 0
                  const disabled = qtd === 0
                  const active = tamanhoSel === t
                  return (
                    <m.button
                      key={t}
                      type="button"
                      disabled={disabled}
                      onClick={() => setTamanhoSel(t)}
                      whileTap={disabled ? undefined : { scale: 0.96 }}
                      transition={springSnappy}
                      className={[
                        'font-mono text-sm uppercase tracking-[0.12em] transition-colors',
                        disabled
                          ? 'cursor-not-allowed text-[rgb(var(--foreground-muted))] line-through opacity-40'
                          : active
                            ? 'font-bold text-[rgb(var(--color-primary-fg))] underline decoration-2 underline-offset-8'
                            : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
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
            <div className="flex items-end gap-6">
              <div>
                <label
                  htmlFor="qtd"
                  className="font-mono text-[10px] uppercase tracking-[0.22em] text-[rgb(var(--foreground-muted))]"
                >
                  [ Qtd ]
                </label>
                <input
                  id="qtd"
                  name="quantidade"
                  type="number"
                  min="1"
                  max={Math.min(estoqueDisponivel, 10)}
                  defaultValue="1"
                  className="mt-2 block w-20 border-0 border-b border-[rgb(var(--foreground-muted)_/_0.4)] bg-transparent px-0 py-1.5 font-mono text-sm tabular-nums focus:border-[rgb(var(--primary))] focus:outline-none"
                />
              </div>
              <p className="pb-1.5 font-mono text-[11px] text-[rgb(var(--foreground-muted))]">
                máx. {Math.min(estoqueDisponivel, 10)}
              </p>
            </div>
          )}

          <AnimatePresence>
            {state.error && (
              <m.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400"
              >
                {state.error}
              </m.p>
            )}
          </AnimatePresence>

          <div className="flex flex-wrap items-center gap-4 border-t border-[rgb(var(--border)_/_0.7)] pt-5">
            <div className="min-w-0">
              {produto.precoOriginalLabel ? (
                <span className="block font-mono text-sm text-[rgb(var(--foreground-muted))] line-through">
                  {produto.precoOriginalLabel}
                </span>
              ) : null}
              <span className="font-mono text-2xl font-bold tabular-nums text-[rgb(var(--color-primary-fg))]">
                {produto.precoLabel}
              </span>
            </div>
            <m.button
              type="submit"
              disabled={pending || esgotado}
              whileTap={{ scale: pending || esgotado ? 1 : 0.98 }}
              transition={springSnappy}
              className={[
                'inline-flex flex-1 items-center justify-center gap-2 px-5 py-3.5 font-mono text-xs font-semibold uppercase tracking-[0.16em] transition-opacity sm:flex-none sm:min-w-[220px]',
                esgotado
                  ? 'cursor-not-allowed bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]'
                  : 'bg-[rgb(var(--primary))] text-[rgb(var(--color-primary-on))] hover:opacity-90 disabled:opacity-50',
              ].join(' ')}
            >
              <ShoppingBag className="h-4 w-4" />
              {pending ? 'Adicionando…' : esgotado ? 'Esgotado' : 'Adicionar à sacola'}
            </m.button>
          </div>
        </m.form>
      )}
    </AnimatePresence>
  )
}
