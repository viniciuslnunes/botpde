'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import { finalizarPedido } from '../actions'
import { ArrowRight, CheckCircle2, Store } from 'lucide-react'
import { rotuloTamanho } from '@torcida/types'
import type { CheckoutItemSerializado } from '@/lib/loja-serialize'
import { MotionSuccessPanel } from '@/components/motion/motion-success-panel'
import { collapsePanel, springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import { useUnsavedChanges } from '@/lib/unsaved-changes'
import { buscarEnderecoPorCep } from '@/lib/viacep'
import { LojaCheckoutStepper } from '../_components/loja-fluxo'

function formatarPreco(preco: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preco)
}

export type CupomDisponivel = { codigo: string; lojaNome: string; texto: string }

export type CheckoutLojaMeta = { tenantId: string; nome: string }

export function CheckoutForm({
  itens,
  subtotal,
  cuponsDisponiveis,
  lojas,
}: {
  itens: CheckoutItemSerializado[]
  subtotal: number
  cuponsDisponiveis: CupomDisponivel[]
  lojas: CheckoutLojaMeta[]
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState(finalizarPedido, {})
  const [modalidade, setModalidade] = useState<'RETIRADA' | 'ENVIO'>('RETIRADA')
  const [cupom, setCupom] = useState('')

  useEffect(() => {
    if (!state.success || !state.redirectTo) return
    router.replace(state.redirectTo)
  }, [state.success, state.redirectTo, router])

  const nomes = useMemo(() => new Map(lojas.map((l) => [l.tenantId, l.nome])), [lojas])

  const grupos = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, CheckoutItemSerializado[]>()
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
      nome: nomes.get(tenantId) ?? 'Loja',
      itens: map.get(tenantId)!,
      subtotal: map.get(tenantId)!.reduce((acc, i) => acc + i.produto.preco * i.quantidade, 0),
    }))
  }, [itens, nomes])

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
        <div className="space-y-6">
          <LojaCheckoutStepper atual="pedido" lojasCount={grupos.length} />
          <MotionSuccessPanel
            key="success"
            icon={<CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-[rgb(var(--color-primary-fg))]" />}
            title={grupos.length > 1 ? 'Pedidos realizados!' : 'Pedido realizado!'}
            description={
              state.ticketConversaIds?.length === 1
                ? 'Abrindo a conversa do pedido…'
                : grupos.length > 1
                  ? `Abrimos ${grupos.length} pedidos (um por loja). Levando você aos seus pedidos…`
                  : 'Levando você ao atendimento do pedido…'
            }
            className="border border-[rgb(var(--border))] bg-[rgb(var(--color-primary)_/_0.06)] p-8 text-center"
          />
        </div>
      ) : (
        <div className="space-y-6">
          <LojaCheckoutStepper atual="checkout" lojasCount={grupos.length} />

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
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
                  [ Cupom ]
                </p>
                <input
                  name="cupomCodigo"
                  data-unsaved-label="Cupom"
                  value={cupom}
                  onChange={(e) => setCupom(e.target.value)}
                  placeholder="Código do cupom"
                  className="mt-2 w-full border-0 border-b border-[rgb(var(--border))] bg-transparent px-0 py-2 font-mono text-sm uppercase focus:border-[rgb(var(--primary))] focus:outline-none"
                />
                {cuponsDisponiveis.length > 0 && (
                  <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
                    Disponível:{' '}
                    {cuponsDisponiveis
                      .map((c) => `${c.codigo} (${c.texto}${c.lojaNome ? ` · ${c.lojaNome}` : ''})`)
                      .join(' · ')}
                  </p>
                )}
                {grupos.length > 1 && (
                  <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
                    O mesmo código é validado em cada loja do checkout.
                  </p>
                )}
              </div>

              <div>
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
                  [ Entrega ]
                </p>
                <div className="space-y-2">
                  <m.label
                    layout
                    className="flex cursor-pointer items-start gap-3 border border-[rgb(var(--border))] p-4 has-[:checked]:border-[rgb(var(--primary))]"
                  >
                    <input
                      type="radio"
                      name="modalidadeEntrega"
                      value="RETIRADA"
                      checked={modalidade === 'RETIRADA'}
                      onChange={() => setModalidade('RETIRADA')}
                    />
                    <div>
                      <p className="font-medium">Retirada na sede</p>
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">
                        Combinada com a unidade após a confirmação
                      </p>
                    </div>
                  </m.label>
                  <m.label
                    layout
                    className="flex cursor-pointer items-start gap-3 border border-[rgb(var(--border))] p-4 has-[:checked]:border-[rgb(var(--primary))]"
                  >
                    <input
                      type="radio"
                      name="modalidadeEntrega"
                      value="ENVIO"
                      checked={modalidade === 'ENVIO'}
                      onChange={() => setModalidade('ENVIO')}
                    />
                    <div>
                      <p className="font-medium">Envio por correios</p>
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">
                        Frete calculado pela administração após confirmação
                      </p>
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
                    <div className="space-y-3 border border-[rgb(var(--border))] p-4">
                      <input name="enderecoEntrega" type="hidden" value="" id="endereco-json" />
                      <input
                        id="cep"
                        placeholder="CEP"
                        required
                        onChange={async (e) => {
                          const endereco = await buscarEnderecoPorCep(e.target.value)
                          if (!endereco) return
                          const rua = document.getElementById('rua') as HTMLInputElement | null
                          if (endereco.logradouro && rua) rua.value = endereco.logradouro
                        }}
                        className="w-full border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm focus:border-[rgb(var(--primary))] focus:outline-none"
                      />
                      <input
                        id="rua"
                        placeholder="Rua"
                        required
                        className="w-full border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm focus:border-[rgb(var(--primary))] focus:outline-none"
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          id="numero"
                          placeholder="Número"
                          required
                          className="border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm focus:border-[rgb(var(--primary))] focus:outline-none"
                        />
                        <input
                          id="complemento"
                          placeholder="Complemento (opcional)"
                          className="border border-[rgb(var(--border))] bg-transparent px-3 py-2 text-sm focus:border-[rgb(var(--primary))] focus:outline-none"
                        />
                      </div>
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
            </div>

            <m.div layout className="h-fit space-y-5 border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 sm:p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--foreground-muted))]">
                [ Resumo ]
              </p>

              <div className="space-y-4">
                {grupos.map((grupo) => (
                  <div key={grupo.tenantId} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                        <Store className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--foreground-muted))]" />
                        <span className="truncate">{grupo.nome}</span>
                      </p>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-[rgb(var(--foreground-muted))]">
                        {formatarPreco(grupo.subtotal)}
                      </span>
                    </div>
                    <m.ul variants={staggerContainer} initial="hidden" animate="show" className="space-y-1.5 text-sm">
                      {grupo.itens.map((i) => (
                        <m.li key={i.id} variants={staggerItem} className="flex justify-between gap-2 text-[rgb(var(--foreground-muted))]">
                          <span className="truncate">
                            {i.produto.nome}
                            {rotuloTamanho(i.tamanho) ? ` (${rotuloTamanho(i.tamanho)})` : ''} × {i.quantidade}
                          </span>
                          <span className="shrink-0 font-mono tabular-nums">
                            {formatarPreco(i.produto.preco * i.quantidade)}
                          </span>
                        </m.li>
                      ))}
                    </m.ul>
                  </div>
                ))}
              </div>

              <div className="flex justify-between border-t border-[rgb(var(--border))] pt-3 text-lg font-bold">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
                  Subtotal
                </span>
                <m.span layout className="font-mono tabular-nums text-[rgb(var(--color-primary-fg))]">
                  {formatarPreco(subtotal)}
                </m.span>
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
                    hidden.value = JSON.stringify({
                      cep,
                      rua,
                      numero,
                      complemento: complemento || undefined,
                    })
                  }
                }}
                className="flex w-full items-center justify-center gap-2 bg-[rgb(var(--primary))] py-3.5 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[rgb(var(--color-primary-on))] disabled:opacity-50"
              >
                {pending
                  ? 'Processando…'
                  : grupos.length > 1
                    ? `Confirmar ${grupos.length} pedidos`
                    : 'Confirmar pedido'}
                {!pending && <ArrowRight className="h-4 w-4" />}
              </m.button>
              <p className="text-center font-mono text-[10px] uppercase tracking-[0.12em] text-[rgb(var(--foreground-muted))]">
                Pagamento combinado após confirmação
              </p>
            </m.div>
          </m.form>
        </div>
      )}
    </AnimatePresence>
  )
}
