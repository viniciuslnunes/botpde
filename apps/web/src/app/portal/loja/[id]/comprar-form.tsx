'use client'

import { useActionState, useState } from 'react'
import { fazerPedido } from '../actions'
import { ShoppingBag, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

type Produto = {
  id: string
  tamanhos: string[]
  estoque: Record<string, number>
}

export function ComprarForm({ produto }: { produto: Produto }) {
  const [state, action, pending] = useActionState(fazerPedido, {})
  const [tamanhoSel, setTamanhoSel] = useState<string>(produto.tamanhos[0] ?? '')

  const semTamanho = produto.tamanhos.length === 0
  const chave = semTamanho ? 'UN' : tamanhoSel
  const estoqueDisponivel = produto.estoque[chave] ?? 0
  const esgotado = estoqueDisponivel === 0

  if (state.success) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-800 dark:bg-emerald-950">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
        <h3 className="font-semibold text-emerald-800 dark:text-emerald-200">Pedido realizado!</h3>
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
          Seu pedido foi registrado e será processado em breve.
        </p>
        <div className="mt-4 flex gap-3 justify-center">
          <Link
            href="/portal/loja/pedidos"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Ver meus pedidos
          </Link>
          <Link
            href="/portal/loja"
            className="rounded-xl border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
          >
            Continuar comprando
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="produtoId" value={produto.id} />

      {/* Seletor de tamanho */}
      {!semTamanho && (
        <div>
          <label className="block text-sm font-semibold text-[rgb(var(--foreground))]">Tamanho</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {produto.tamanhos.map((t) => {
              const qtd = produto.estoque[t] ?? 0
              const disabled = qtd === 0
              return (
                <button
                  key={t}
                  type="button"
                  disabled={disabled}
                  onClick={() => setTamanhoSel(t)}
                  className={[
                    'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                    disabled
                      ? 'cursor-not-allowed border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] opacity-40'
                      : tamanhoSel === t
                        ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary))] text-white'
                        : 'border-[rgb(var(--border))] text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))] hover:text-[rgb(var(--primary))]',
                  ].join(' ')}
                >
                  {t}
                </button>
              )
            })}
          </div>
          <input type="hidden" name="tamanho" value={tamanhoSel} />
        </div>
      )}

      {/* Quantidade */}
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
            className="mt-1 w-24 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
          />
        </div>
      )}

      {/* Erro */}
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {state.error}
        </p>
      )}

      {/* Botão */}
      <button
        type="submit"
        disabled={pending || esgotado}
        className={[
          'flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all',
          esgotado
            ? 'cursor-not-allowed bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]'
            : 'bg-[rgb(var(--primary))] text-white hover:opacity-90 disabled:opacity-50',
        ].join(' ')}
      >
        <ShoppingBag className="h-4 w-4" />
        {pending ? 'Processando...' : esgotado ? 'Produto esgotado' : 'Comprar agora'}
      </button>

      {!esgotado && (
        <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">
          Pedido processado pela administração da torcida
        </p>
      )}
    </form>
  )
}
