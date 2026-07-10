'use client'

import { useActionState, useState } from 'react'
import { finalizarPedido } from '../actions'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { rotuloTamanho } from '@torcida/types'
import type { CheckoutItemSerializado } from '@/lib/loja-serialize'

function formatarPreco(preco: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preco)
}

export function CheckoutForm({ itens, subtotal }: { itens: CheckoutItemSerializado[]; subtotal: number }) {
  const [state, action, pending] = useActionState(finalizarPedido, {})
  const [modalidade, setModalidade] = useState<'RETIRADA' | 'ENVIO'>('RETIRADA')

  if (state.success) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-800 dark:bg-emerald-950">
        <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
        <h2 className="text-xl font-bold text-emerald-800 dark:text-emerald-200">Pedido realizado!</h2>
        <p className="mt-2 text-sm text-emerald-700">A administração irá processar seu pedido em breve.</p>
        <Link href="/portal/loja/pedidos" className="mt-6 inline-block rounded-xl bg-emerald-600 px-5 py-2 text-sm text-white">
          Ver meus pedidos
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        <div>
          <h2 className="font-semibold mb-3">Cupom de desconto</h2>
          <input
            name="cupomCodigo"
            placeholder="Ex.: EUSOUGAVIAO"
            className="w-full rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm uppercase"
          />
          <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">10% na primeira compra com EUSOUGAVIAO</p>
        </div>

        <div>
          <h2 className="font-semibold mb-3">Entrega</h2>
          <div className="space-y-2">
            <label className="flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] p-4 cursor-pointer has-[:checked]:border-[rgb(var(--primary))]">
              <input type="radio" name="modalidadeEntrega" value="RETIRADA" checked={modalidade === 'RETIRADA'} onChange={() => setModalidade('RETIRADA')} />
              <div>
                <p className="font-medium">Retirada na sede</p>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">R. Cristina Tomás, 183 — Bom Retiro, São Paulo/SP</p>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] p-4 cursor-pointer has-[:checked]:border-[rgb(var(--primary))]">
              <input type="radio" name="modalidadeEntrega" value="ENVIO" checked={modalidade === 'ENVIO'} onChange={() => setModalidade('ENVIO')} />
              <div>
                <p className="font-medium">Envio por correios</p>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">Frete calculado pela administração após confirmação</p>
              </div>
            </label>
          </div>
        </div>

        {modalidade === 'ENVIO' && (
          <div className="space-y-3 rounded-xl border border-[rgb(var(--border))] p-4">
            <input name="enderecoEntrega" type="hidden" value="" id="endereco-json" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input id="cep" placeholder="CEP" required className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm" />
              <input id="numero" placeholder="Número" required className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm" />
            </div>
            <input id="rua" placeholder="Rua" required className="w-full rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm" />
            <input id="complemento" placeholder="Complemento (opcional)" className="w-full rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm" />
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 space-y-4 h-fit">
        <h2 className="font-semibold">Resumo</h2>
        <ul className="space-y-2 text-sm">
          {itens.map((i) => (
            <li key={i.id} className="flex justify-between gap-2">
              <span className="truncate">{i.produto.nome}{rotuloTamanho(i.tamanho) ? ` (${rotuloTamanho(i.tamanho)})` : ''} × {i.quantidade}</span>
              <span className="shrink-0">{formatarPreco(i.produto.preco * i.quantidade)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-[rgb(var(--border))] pt-3 flex justify-between font-bold text-lg">
          <span>Subtotal</span>
          <span>{formatarPreco(subtotal)}</span>
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          onClick={(e) => {
            if (modalidade === 'ENVIO') {
              const cep = (document.getElementById('cep') as HTMLInputElement)?.value
              const rua = (document.getElementById('rua') as HTMLInputElement)?.value
              const numero = (document.getElementById('numero') as HTMLInputElement)?.value
              const complemento = (document.getElementById('complemento') as HTMLInputElement)?.value
              if (!cep || !rua || !numero) {
                e.preventDefault()
                alert('Preencha CEP, rua e número.')
                return
              }
              const hidden = document.getElementById('endereco-json') as HTMLInputElement
              hidden.name = 'enderecoEntrega'
              hidden.value = JSON.stringify({ cep, rua, numero, complemento: complemento || undefined })
            }
          }}
          className="w-full rounded-xl bg-[rgb(var(--primary))] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? 'Processando...' : 'Confirmar pedido'}
        </button>
        <p className="text-xs text-center text-[rgb(var(--foreground-muted))]">Pagamento combinado com a administração após confirmação</p>
      </div>
    </form>
  )
}
