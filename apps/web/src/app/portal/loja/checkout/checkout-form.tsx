'use client'

import { useActionState, useMemo, useRef, useState, type InputHTMLAttributes, type Ref } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { finalizarPedido, type ActionState } from '../actions'
import { isRedirectError } from '@/lib/toast-action'
import { ArrowRight, Store } from 'lucide-react'
import { rotuloTamanho } from '@torcida/types'
import type { CheckoutItemSerializado } from '@/lib/loja-serialize'
import { collapsePanel, springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import { useUnsavedChanges } from '@/lib/unsaved-changes'
import { buscarEnderecoPorCep } from '@/lib/viacep'
import {
  validarEnderecoEnvio,
  type ErrosEnderecoCheckout,
} from '@/lib/loja-checkout-endereco'
import { LojaCheckoutStepper } from '../_components/loja-fluxo'

async function finalizarPedidoNaUi(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    return await finalizarPedido(prev, formData)
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      error:
        'A conexão com o servidor caiu no meio do envio. Recarregue e tente de novo — se o pedido já saiu, ele aparece em Pedidos.',
    }
  }
}

const inputBase =
  'w-full border bg-transparent px-3 py-2 text-sm focus:outline-none'

function classeCampo(invalido: boolean) {
  return invalido
    ? `${inputBase} border-[rgb(var(--color-danger))] focus:border-[rgb(var(--color-danger-fg))]`
    : `${inputBase} border-[rgb(var(--border))] focus:border-[rgb(var(--primary))]`
}

function CampoCheckout({
  id,
  label,
  value,
  onChange,
  erro,
  inputRef,
  autoComplete,
  inputMode,
}: {
  id: string
  label: string
  value: string
  onChange: (valor: string) => void
  erro?: string
  inputRef?: Ref<HTMLInputElement>
  autoComplete?: string
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode']
}) {
  const erroId = `${id}-erro`
  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        aria-label={label}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? erroId : undefined}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={classeCampo(Boolean(erro))}
      />
      {erro ? (
        <p id={erroId} className="mt-1.5 text-xs text-[rgb(var(--color-danger-fg))]">
          {erro}
        </p>
      ) : null}
    </div>
  )
}

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
  const [state, action, pending] = useActionState(finalizarPedidoNaUi, {})
  const [modalidade, setModalidade] = useState<'RETIRADA' | 'ENVIO'>('RETIRADA')
  const [cupom, setCupom] = useState('')
  const [cep, setCep] = useState('')
  const [rua, setRua] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [errosEndereco, setErrosEndereco] = useState<ErrosEnderecoCheckout>({})
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const cepRef = useRef<HTMLInputElement>(null)
  const ruaRef = useRef<HTMLInputElement>(null)
  const numeroRef = useRef<HTMLInputElement>(null)

  function limparErroCampo(campo: keyof ErrosEnderecoCheckout) {
    setErrosEndereco((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev))
  }

  function escolherModalidade(proxima: 'RETIRADA' | 'ENVIO') {
    setModalidade(proxima)
    setErrosEndereco({})
    setErroLocal(null)
  }

  async function aoMudarCep(valor: string) {
    setCep(valor)
    limparErroCampo('cep')
    const endereco = await buscarEnderecoPorCep(valor)
    if (!endereco?.logradouro) return
    setRua(endereco.logradouro)
    limparErroCampo('rua')
  }

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
    isDirty: checkoutChanges.length > 0,
    changes: checkoutChanges,
  })

  const temErroEndereco = Boolean(errosEndereco.cep || errosEndereco.rua || errosEndereco.numero)
  const erroResumo = (temErroEndereco ? erroLocal : null) || state.error

  return (
    <div className="space-y-6">
      <LojaCheckoutStepper atual="checkout" lojasCount={grupos.length} />

      <m.form
        key="form"
        action={action}
        noValidate
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSnappy}
        // `[&>*]:min-w-0`: item de grid tem `min-width: auto`, então o
        // min-content de um filho (resumo do pedido, campo de endereço) vira o
        // piso da coluna e estoura a viewport em 320px. Mesmo tratamento do
        // `InsightSection` — ver ARCHITECTURE §5.20.
        className="grid gap-8 [&>*]:min-w-0 lg:grid-cols-2"
        onSubmit={(e) => {
          if (modalidade !== 'ENVIO') {
            setErroLocal(null)
            return
          }
          const erros = validarEnderecoEnvio({ cep, rua, numero })
          if (erros.cep || erros.rua || erros.numero) {
            e.preventDefault()
            setErrosEndereco(erros)
            setErroLocal('Informe o CEP, a rua e o número para envio.')
            const primeiro = erros.cep ? cepRef : erros.rua ? ruaRef : numeroRef
            primeiro.current?.focus()
            return
          }
          setErrosEndereco({})
          setErroLocal(null)
        }}
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
                      onChange={() => escolherModalidade('RETIRADA')}
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
                      onChange={() => escolherModalidade('ENVIO')}
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
                    <div
                      className={
                        temErroEndereco
                          ? 'space-y-3 border border-[rgb(var(--color-danger)_/_0.45)] bg-[rgb(var(--color-danger)_/_0.04)] p-4'
                          : 'space-y-3 border border-[rgb(var(--border))] p-4'
                      }
                    >
                      <input
                        name="enderecoEntrega"
                        type="hidden"
                        value={JSON.stringify({
                          cep: cep.trim(),
                          rua: rua.trim(),
                          numero: numero.trim(),
                          complemento: complemento.trim() || undefined,
                        })}
                      />
                      <CampoCheckout
                        id="cep"
                        label="CEP"
                        value={cep}
                        onChange={aoMudarCep}
                        erro={errosEndereco.cep}
                        inputRef={cepRef}
                        autoComplete="postal-code"
                        inputMode="numeric"
                      />
                      <CampoCheckout
                        id="rua"
                        label="Rua"
                        value={rua}
                        onChange={(valor) => {
                          setRua(valor)
                          limparErroCampo('rua')
                        }}
                        erro={errosEndereco.rua}
                        inputRef={ruaRef}
                        autoComplete="address-line1"
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <CampoCheckout
                          id="numero"
                          label="Número"
                          value={numero}
                          onChange={(valor) => {
                            setNumero(valor)
                            limparErroCampo('numero')
                          }}
                          erro={errosEndereco.numero}
                          inputRef={numeroRef}
                          inputMode="numeric"
                        />
                        <CampoCheckout
                          id="complemento"
                          label="Complemento (opcional)"
                          value={complemento}
                          onChange={setComplemento}
                          autoComplete="address-line2"
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
                {erroResumo && (
                  <m.div
                    key="erro-checkout"
                    role="alert"
                    aria-live="assertive"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="border border-[rgb(var(--color-danger)_/_0.4)] bg-[rgb(var(--color-danger)_/_0.08)] px-3 py-2.5"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[rgb(var(--color-danger-fg))]">
                      Não foi possível confirmar
                    </p>
                    <p className="mt-0.5 text-sm text-[rgb(var(--color-danger-fg))]">{erroResumo}</p>
                  </m.div>
                )}
              </AnimatePresence>

              <m.button
                type="submit"
                disabled={pending}
                whileTap={{ scale: pending ? 1 : 0.98 }}
                transition={springSnappy}
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
  )
}
