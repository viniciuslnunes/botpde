'use client'

import { useActionState, useMemo, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { finalizarPedido } from '../actions'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { rotuloTamanho } from '@torcida/types'
import type { CheckoutItemSerializado } from '@/lib/loja-serialize'
import { MotionSuccessPanel } from '@/components/motion/motion-success-panel'
import { collapsePanel, springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import { useUnsavedChanges } from '@/lib/unsaved-changes'
import { buscarEnderecoPorCep } from '@/lib/viacep'

function formatarPreco(preco: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preco)
}

export function CheckoutForm({ itens, subtotal }: { itens: CheckoutItemSerializado[]; subtotal: number }) {
  const [state, action, pending] = useActionState(finalizarPedido, {})
  const [modalidade, setModalidade] = useState<'RETIRADA' | 'ENVIO'>('RETIRADA')
  const [cupom, setCupom] = useState('')

  const checkoutChanges = useMemo(() => {
    const list: string[] = []
    if (cupom.trim()) list.push('Cupom')
    if (modalidade === 'ENVIO') list.push('Modalidade: envio')
    return list
  }, [cupom, modalidade])

  useUnsavedChanges({
    id: 'checkout-form',
    title: 'Checkout',
    isDirty: !state.success && checkoutChanges.length > 0,
    changes: checkoutChanges,
  })

  return (
    <AnimatePresence mode="wait">
      {state.success ? (
        <MotionSuccessPanel
          key="success"
          icon={<CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />}
          title="Pedido realizado!"
          description="A administração irá processar seu pedido em breve."
        >
          <Link
            href="/portal/loja/pedidos"
            className="mt-6 inline-block rounded-xl bg-emerald-600 px-5 py-2 text-sm text-white"
          >
            Ver meus pedidos
          </Link>
        </MotionSuccessPanel>
      ) : (
        <m.form
          key="form"
          action={action}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={springSnappy}
          className="grid gap-8 lg:grid-cols-2"
        >
          <div className="space-y-6">
            <div>
              <h2 className="font-semibold mb-3">Cupom de desconto</h2>
              <input
                name="cupomCodigo"
                data-unsaved-label="Cupom"
                value={cupom}
                onChange={(e) => setCupom(e.target.value)}
                placeholder="Ex.: EUSOUGAVIAO"
                className="w-full rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm uppercase"
              />
              <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">10% na primeira compra com EUSOUGAVIAO</p>
            </div>

            <div>
              <h2 className="font-semibold mb-3">Entrega</h2>
              <div className="space-y-2">
                <m.label
                  layout
                  className="flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] p-4 cursor-pointer has-[:checked]:border-[rgb(var(--primary))]"
                >
                  <input type="radio" name="modalidadeEntrega" value="RETIRADA" checked={modalidade === 'RETIRADA'} onChange={() => setModalidade('RETIRADA')} />
                  <div>
                    <p className="font-medium">Retirada na sede</p>
                    <p className="text-xs text-[rgb(var(--foreground-muted))]">R. Cristina Tomás, 183 — Bom Retiro, São Paulo/SP</p>
                  </div>
                </m.label>
                <m.label
                  layout
                  className="flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] p-4 cursor-pointer has-[:checked]:border-[rgb(var(--primary))]"
                >
                  <input type="radio" name="modalidadeEntrega" value="ENVIO" checked={modalidade === 'ENVIO'} onChange={() => setModalidade('ENVIO')} />
                  <div>
                    <p className="font-medium">Envio por correios</p>
                    <p className="text-xs text-[rgb(var(--foreground-muted))]">Frete calculado pela administração após confirmação</p>
                  </div>
                </m.label>
              </div>
            </div>

            <AnimatePresence>
              {modalidade === 'ENVIO' && (
                <m.div
                  key="endereco"
                  variants={collapsePanel}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  transition={springSnappy}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 rounded-xl border border-[rgb(var(--border))] p-4">
                    <input name="enderecoEntrega" type="hidden" value="" id="endereco-json" />
                    <input
                      id="cep"
                      placeholder="CEP"
                      required
                      onChange={async (e) => {
                        // Sempre sobrescreve — um CEP novo e válido substitui a
                        // rua anterior na hora, mesmo que o campo já estivesse preenchido.
                        const endereco = await buscarEnderecoPorCep(e.target.value)
                        if (!endereco) return
                        const rua = document.getElementById('rua') as HTMLInputElement | null
                        if (endereco.logradouro && rua) rua.value = endereco.logradouro
                      }}
                      className="w-full rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm"
                    />
                    <input id="rua" placeholder="Rua" required className="w-full rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input id="numero" placeholder="Número" required className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm" />
                      <input id="complemento" placeholder="Complemento (opcional)" className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm" />
                    </div>
                  </div>
                </m.div>
              )}
            </AnimatePresence>
          </div>

          <m.div
            layout
            className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 space-y-4 h-fit"
          >
            <h2 className="font-semibold">Resumo</h2>
            <m.ul variants={staggerContainer} initial="hidden" animate="show" className="space-y-2 text-sm">
              {itens.map((i) => (
                <m.li key={i.id} variants={staggerItem} className="flex justify-between gap-2">
                  <span className="truncate">{i.produto.nome}{rotuloTamanho(i.tamanho) ? ` (${rotuloTamanho(i.tamanho)})` : ''} × {i.quantidade}</span>
                  <span className="shrink-0">{formatarPreco(i.produto.preco * i.quantidade)}</span>
                </m.li>
              ))}
            </m.ul>
            <div className="border-t border-[rgb(var(--border))] pt-3 flex justify-between font-bold text-lg">
              <span>Subtotal</span>
              <m.span layout>{formatarPreco(subtotal)}</m.span>
            </div>
            <AnimatePresence>
              {state.error && (
                <m.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-sm text-red-600"
                >
                  {state.error}
                </m.p>
              )}
            </AnimatePresence>
            <m.button
              type="submit"
              disabled={pending}
              whileTap={{ scale: pending ? 1 : 0.98 }}
              transition={springSnappy}
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
            </m.button>
            <p className="text-xs text-center text-[rgb(var(--foreground-muted))]">Pagamento combinado com a administração após confirmação</p>
          </m.div>
        </m.form>
      )}
    </AnimatePresence>
  )
}
