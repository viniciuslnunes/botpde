'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import {
  ArrowLeft,
  Banknote,
  Beer,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  QrCode,
  ReceiptText,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import {
  METODO_PAGAMENTO_BAR,
  METODO_PAGAMENTO_BAR_LABEL,
  resumirVenda,
} from '@torcida/types'
import { toast } from '@torcida/ui'
import {
  cancelarVendaBar,
  confirmarPixMockBar,
  consultarStatusVendaBar,
  registrarVendaBar,
} from '@/app/admin/bar/actions'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { MotionSuccessPanel } from '@/components/motion/motion-success-panel'
import { cartItemExit, springSnappy, staggerContainer, staggerItem } from '@/lib/motion-presets'
import { useVisibleInterval } from '@/lib/use-visible-interval'
import type { BarProdutoSerializado, BarVendaSerializada } from '@/lib/bar-serialize'

type Metodo = (typeof METODO_PAGAMENTO_BAR)[number]

type CartLine = {
  produtoId: string
  nome: string
  preco: number
  quantidade: number
  estoque: number
}

type PixPendente = {
  vendaId: string
  copiaCola: string
  provider: string
  total: number
}

type Fase = 'venda' | 'pix' | 'sucesso'

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function formatarTempoRelativo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.max(0, Math.floor(diffMs / 60_000))
  if (min < 1) return 'agora'
  if (min === 1) return '1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return h === 1 ? '1 h' : `${h} h`
}

function MetodoIcon({ metodo }: { metodo: Metodo }) {
  if (metodo === 'PIX') return <QrCode className="h-4 w-4" />
  if (metodo === 'DINHEIRO') return <Banknote className="h-4 w-4" />
  return <CreditCard className="h-4 w-4" />
}

function Stepper({
  value,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
  label,
}: {
  value: number
  onMinus: () => void
  onPlus: () => void
  minusDisabled?: boolean
  plusDisabled?: boolean
  label: string
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-0.5">
      <button
        type="button"
        aria-label={`Diminuir ${label}`}
        disabled={minusDisabled}
        onClick={(e) => {
          e.stopPropagation()
          onMinus()
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-7 text-center text-sm font-semibold tabular-nums text-[rgb(var(--foreground))]">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        disabled={plusDisabled}
        onClick={(e) => {
          e.stopPropagation()
          onPlus()
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--primary))] text-white hover:opacity-90 disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function BarPdv({
  produtos: produtosIniciais,
  categorias,
  pendentes: pendentesIniciais,
  pendentesTotal: pendentesTotalInicial,
  unidadeNome,
  podeCancelar,
}: {
  produtos: BarProdutoSerializado[]
  categorias: { id: string; nome: string }[]
  pendentes: BarVendaSerializada[]
  pendentesTotal: number
  unidadeNome: string
  podeCancelar: boolean
}) {
  const router = useRouter()
  const [produtos, setProdutos] = useState(produtosIniciais)
  const [pendentes, setPendentes] = useState(pendentesIniciais)
  const [pendentesTotal, setPendentesTotal] = useState(pendentesTotalInicial)
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [metodo, setMetodo] = useState<Metodo>('DINHEIRO')
  const [descontoStr, setDescontoStr] = useState('')
  const [observacao, setObservacao] = useState('')
  const [fase, setFase] = useState<Fase>('venda')
  const [pix, setPix] = useState<PixPendente | null>(null)
  const [pixItens, setPixItens] = useState<CartLine[] | null>(null)
  const [ultimoTotal, setUltimoTotal] = useState(0)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [comandaMobileAberta, setComandaMobileAberta] = useState(false)

  const desconto = Math.max(0, Number(descontoStr.replace(',', '.')) || 0)

  const resumo = useMemo(
    () =>
      resumirVenda(
        cart.map((l) => ({ precoUnit: l.preco, quantidade: l.quantidade })),
        desconto,
      ),
    [cart, desconto],
  )

  const qtdItens = useMemo(() => cart.reduce((n, l) => n + l.quantidade, 0), [cart])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return produtos.filter((p) => {
      if (categoriaId && p.categoria?.id !== categoriaId) return false
      if (q && !p.nome.toLowerCase().includes(q)) return false
      return true
    })
  }, [produtos, categoriaId, busca])

  const estoqueDisponivel = useCallback(
    (produtoId: string, estoqueBase: number) => {
      const noCarrinho = cart.find((l) => l.produtoId === produtoId)?.quantidade ?? 0
      return Math.max(0, estoqueBase - noCarrinho)
    },
    [cart],
  )

  function adicionarProduto(p: BarProdutoSerializado) {
    if (fase !== 'venda' || p.estoque <= 0) return
    setErro(null)
    setCart((prev) => {
      const existente = prev.find((l) => l.produtoId === p.id)
      if (existente) {
        if (existente.quantidade >= existente.estoque || existente.quantidade >= 99) return prev
        return prev.map((l) =>
          l.produtoId === p.id ? { ...l, quantidade: l.quantidade + 1 } : l,
        )
      }
      return [
        ...prev,
        {
          produtoId: p.id,
          nome: p.nome,
          preco: p.preco,
          quantidade: 1,
          estoque: p.estoque,
        },
      ]
    })
  }

  function alterarQtd(produtoId: string, delta: number) {
    if (fase !== 'venda') return
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.produtoId !== produtoId) return l
          const next = Math.min(99, Math.min(l.estoque, Math.max(0, l.quantidade + delta)))
          return { ...l, quantidade: next }
        })
        .filter((l) => l.quantidade > 0),
    )
  }

  function setQtdProduto(p: BarProdutoSerializado, delta: number) {
    if (fase !== 'venda') return
    const noCarrinho = cart.find((l) => l.produtoId === p.id)
    if (!noCarrinho && delta > 0) {
      adicionarProduto(p)
      return
    }
    if (noCarrinho) alterarQtd(p.id, delta)
  }

  function removerLinha(produtoId: string) {
    setCart((prev) => prev.filter((l) => l.produtoId !== produtoId))
  }

  function limparCarrinho() {
    setCart([])
    setDescontoStr('')
    setObservacao('')
    setErro(null)
  }

  function aplicarBaixaLocal(linhas: CartLine[]) {
    setProdutos((prev) =>
      prev.map((p) => {
        const linha = linhas.find((l) => l.produtoId === p.id)
        if (!linha) return p
        return { ...p, estoque: Math.max(0, p.estoque - linha.quantidade) }
      }),
    )
  }

  function restaurarBaixaLocal(linhas: CartLine[]) {
    setProdutos((prev) =>
      prev.map((p) => {
        const linha = linhas.find((l) => l.produtoId === p.id)
        if (!linha) return p
        return { ...p, estoque: p.estoque + linha.quantidade }
      }),
    )
  }

  function removerPendente(vendaId: string) {
    setPendentes((prev) => prev.filter((v) => v.id !== vendaId))
    setPendentesTotal((n) => Math.max(0, n - 1))
  }

  function novaVenda() {
    setFase('venda')
    setPix(null)
    setPixItens(null)
    setUltimoTotal(0)
    limparCarrinho()
    setMetodo('DINHEIRO')
    setComandaMobileAberta(false)
  }

  function cobrar() {
    if (cart.length === 0) {
      setErro('Adicione pelo menos um item')
      return
    }
    setErro(null)
    const snapshot = cart.map((l) => ({ ...l }))
    const totalPrevisto = resumo.total

    startTransition(async () => {
      const result = await registrarVendaBar({
        itens: snapshot.map((l) => ({ produtoId: l.produtoId, quantidade: l.quantidade })),
        metodoPagamento: metodo,
        desconto,
        observacao: observacao.trim() || undefined,
      })

      if (!result.success) {
        setErro(result.error)
        toast.error(result.error)
        return
      }

      aplicarBaixaLocal(snapshot)
      setComandaMobileAberta(false)

      if (result.pago) {
        setUltimoTotal(totalPrevisto)
        setFase('sucesso')
        setCart([])
        setDescontoStr('')
        setObservacao('')
        toast.success('Venda registrada', { description: formatarPreco(totalPrevisto) })
        return
      }

      const novaPendente: BarVendaSerializada = {
        id: result.vendaId,
        subtotal: totalPrevisto + desconto,
        desconto,
        total: totalPrevisto,
        metodoPagamento: 'PIX',
        status: 'PENDENTE',
        pagoEm: null,
        observacao: observacao.trim() || null,
        criadoEm: new Date().toISOString(),
        pixCopiaCola: result.pix.copiaCola,
        gatewayProvider: result.pix.provider,
        operador: { id: '', nome: null },
        itens: snapshot.map((l, i) => ({
          id: `local-${i}`,
          produtoId: l.produtoId,
          produtoNome: l.nome,
          quantidade: l.quantidade,
          precoUnit: l.preco,
          total: l.preco * l.quantidade,
        })),
      }
      setPendentes((prev) => [novaPendente, ...prev].slice(0, 8))
      setPendentesTotal((n) => n + 1)

      setPix({
        vendaId: result.vendaId,
        copiaCola: result.pix.copiaCola,
        provider: result.pix.provider,
        total: totalPrevisto,
      })
      setPixItens(snapshot)
      setUltimoTotal(totalPrevisto)
      setFase('pix')
      setCart([])
      setDescontoStr('')
      setObservacao('')
    })
  }

  function retomarPendente(venda: BarVendaSerializada) {
    if (!venda.pixCopiaCola) {
      toast.error('PIX desta venda não está disponível')
      return
    }
    setPix({
      vendaId: venda.id,
      copiaCola: venda.pixCopiaCola,
      provider: venda.gatewayProvider ?? 'mock',
      total: venda.total,
    })
    setPixItens(
      venda.itens
        .filter((i) => i.produtoId)
        .map((i) => ({
          produtoId: i.produtoId!,
          nome: i.produtoNome,
          preco: i.precoUnit,
          quantidade: i.quantidade,
          estoque: i.quantidade,
        })),
    )
    setUltimoTotal(venda.total)
    setFase('pix')
    setComandaMobileAberta(false)
  }

  function cancelarPendenteDaFaixa(venda: BarVendaSerializada) {
    if (!podeCancelar) return
    startTransition(async () => {
      const result = await cancelarVendaBar(venda.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      const linhas: CartLine[] = venda.itens
        .filter((i) => i.produtoId)
        .map((i) => ({
          produtoId: i.produtoId!,
          nome: i.produtoNome,
          preco: i.precoUnit,
          quantidade: i.quantidade,
          estoque: i.quantidade,
        }))
      if (linhas.length) restaurarBaixaLocal(linhas)
      removerPendente(venda.id)
      if (pix?.vendaId === venda.id) {
        setFase('venda')
        setPix(null)
        setPixItens(null)
      }
      toast.message('Venda cancelada — estoque restaurado.')
      router.refresh()
    })
  }

  const pollPix = useCallback(() => {
    if (!pix) return
    void (async () => {
      const status = await consultarStatusVendaBar(pix.vendaId)
      if (!status.success) return
      if (status.status === 'PAGA') {
        removerPendente(pix.vendaId)
        setFase('sucesso')
        setPix(null)
        setPixItens(null)
        toast.success('PIX confirmado', { description: formatarPreco(pix.total) })
      } else if (status.status === 'CANCELADA') {
        if (pixItens) restaurarBaixaLocal(pixItens)
        removerPendente(pix.vendaId)
        setErro('Venda cancelada')
        setFase('venda')
        setPix(null)
        setPixItens(null)
      }
    })()
  }, [pix, pixItens])

  useVisibleInterval(pollPix, 2500, fase === 'pix' && pix != null)

  async function copiarPix() {
    if (!pix?.copiaCola) return
    await navigator.clipboard.writeText(pix.copiaCola)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function confirmarMock() {
    if (!pix) return
    startTransition(async () => {
      const result = await confirmarPixMockBar(pix.vendaId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      removerPendente(pix.vendaId)
      setFase('sucesso')
      setPix(null)
      setPixItens(null)
      toast.success('PIX confirmado (mock)')
    })
  }

  function cancelarPix() {
    if (!pix || !podeCancelar) return
    const vendaId = pix.vendaId
    const itens = pixItens
    startTransition(async () => {
      const result = await cancelarVendaBar(vendaId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (itens) restaurarBaixaLocal(itens)
      removerPendente(vendaId)
      toast.message('Venda cancelada — estoque restaurado.')
      setFase('venda')
      setPix(null)
      setPixItens(null)
      setErro(null)
      router.refresh()
    })
  }

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 pb-3">
        <h2 className="text-lg font-semibold text-[rgb(var(--foreground))]">Venda atual</h2>
        {cart.length > 0 && (
          <button
            type="button"
            onClick={limparCarrinho}
            className="rounded-full px-3 py-1 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--color-danger-fg))]"
          >
            Limpar
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[rgb(var(--border))] px-3 py-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
            Use + nos produtos para montar a comanda
          </p>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {cart.map((l) => (
                <m.li
                  key={l.produtoId}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit="exit"
                  variants={cartItemExit}
                  transition={springSnappy}
                  className="flex items-center gap-2 rounded-2xl bg-[rgb(var(--background))] px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                      {l.nome}
                    </p>
                    <p className="text-xs tabular-nums text-[rgb(var(--foreground-muted))]">
                      {formatarPreco(l.preco)} · {formatarPreco(l.preco * l.quantidade)}
                    </p>
                  </div>
                  <Stepper
                    label={l.nome}
                    value={l.quantidade}
                    onMinus={() => alterarQtd(l.produtoId, -1)}
                    onPlus={() => alterarQtd(l.produtoId, 1)}
                    plusDisabled={l.quantidade >= l.estoque || l.quantidade >= 99 || pending}
                  />
                  <button
                    type="button"
                    aria-label={`Remover ${l.nome}`}
                    onClick={() => removerLinha(l.produtoId)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[rgb(var(--color-danger-fg))] hover:bg-[rgb(var(--color-danger)_/_0.08)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <div className="mt-3 shrink-0 space-y-3 border-t border-[rgb(var(--border))] pt-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Desconto (R$)
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={descontoStr}
              onChange={(e) => setDescontoStr(e.target.value)}
              placeholder="0,00"
              className="mt-1 w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm tabular-nums text-[rgb(var(--foreground))]"
            />
          </label>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Observação
            <input
              type="text"
              maxLength={200}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Opcional"
              className="mt-1 w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm text-[rgb(var(--foreground))]"
            />
          </label>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-[rgb(var(--foreground-muted))]">Pagamento</p>
          <div className="flex flex-wrap gap-1.5">
            {(METODO_PAGAMENTO_BAR as readonly Metodo[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetodo(m)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors',
                  metodo === m
                    ? 'bg-[rgb(var(--primary))] text-white'
                    : 'border border-[rgb(var(--border))] bg-[rgb(var(--background))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
                ].join(' ')}
              >
                <MetodoIcon metodo={m} />
                {METODO_PAGAMENTO_BAR_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-[rgb(var(--background))] px-4 py-3">
          <div className="flex justify-between text-sm text-[rgb(var(--foreground-muted))]">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatarPreco(resumo.subtotal)}</span>
          </div>
          {resumo.desconto > 0 && (
            <div className="mt-1 flex justify-between text-sm text-[rgb(var(--foreground-muted))]">
              <span>Desconto</span>
              <span className="tabular-nums">−{formatarPreco(resumo.desconto)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between text-xl font-bold text-[rgb(var(--foreground))]">
            <span>Total</span>
            <span className="tabular-nums text-[rgb(var(--color-primary-fg))]">
              {formatarPreco(resumo.total)}
            </span>
          </div>
        </div>

        {erro && (
          <p className="rounded-2xl bg-[rgb(var(--color-danger)_/_0.1)] px-3 py-2 text-sm text-[rgb(var(--color-danger-fg))]">
            {erro}
          </p>
        )}

        <button
          type="button"
          disabled={pending || cart.length === 0}
          onClick={cobrar}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[rgb(var(--primary))] px-4 py-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {metodo === 'PIX' ? 'Gerar PIX' : 'Cobrar'} · {formatarPreco(resumo.total)}
        </button>
      </div>
    </div>
  )

  if (fase === 'sucesso') {
    return (
      <div className="flex h-full min-h-0 items-center justify-center p-6">
        <MotionSuccessPanel
          icon={
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600 dark:text-emerald-400" />
          }
          title="Venda paga"
          description={formatarPreco(ultimoTotal)}
          className="w-full max-w-md rounded-3xl border border-[rgb(var(--color-success)_/_0.35)] bg-[rgb(var(--color-success)_/_0.08)] p-8 text-center"
        >
          <button
            type="button"
            onClick={novaVenda}
            className="mt-6 inline-flex rounded-2xl bg-[rgb(var(--primary))] px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Nova venda
          </button>
        </MotionSuccessPanel>
      </div>
    )
  }

  if (fase === 'pix' && pix) {
    const mock = pix.provider === 'mock'
    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-4 py-3">
          <div>
            <p className="text-xs font-medium text-[rgb(var(--foreground-muted))]">Aguardando PIX</p>
            <p className="text-lg font-bold tabular-nums text-[rgb(var(--color-primary-fg))]">
              {formatarPreco(pix.total)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFase('venda')
              setPix(null)
              setPixItens(null)
            }}
            className="rounded-full border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            Voltar ao PDV
          </button>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
            <div className="text-center">
              <p className="mt-2 flex items-center justify-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Confirmando automaticamente…
              </p>
            </div>

            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pix.copiaCola)}`}
                alt="QR Code Pix"
                width={200}
                height={200}
                className="rounded-2xl border border-[rgb(var(--border))] bg-white p-2"
              />
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Pix copia e cola
              </p>
              <p className="break-all rounded-2xl bg-[rgb(var(--background-subtle))] p-3 font-mono text-xs text-[rgb(var(--foreground))]">
                {pix.copiaCola}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void copiarPix()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[rgb(var(--border))] px-4 py-2.5 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]"
            >
              <Copy className="h-4 w-4" />
              {copied ? 'Copiado!' : 'Copiar código'}
            </button>

            {mock && (
              <button
                type="button"
                disabled={pending}
                onClick={confirmarMock}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[rgb(var(--primary))] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Já paguei (mock)
              </button>
            )}

            {podeCancelar && (
              <button
                type="button"
                disabled={pending}
                onClick={cancelarPix}
                className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium text-[rgb(var(--color-danger-fg))] hover:bg-[rgb(var(--color-danger)_/_0.08)] disabled:opacity-60"
              >
                <X className="h-4 w-4" />
                Cancelar venda
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[rgb(var(--background))]">
      {/* Header mínimo */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            PDV Bar
          </p>
          <h1 className="truncate text-base font-bold text-[rgb(var(--foreground))] sm:text-lg">
            {unidadeNome}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/admin/bar/vendas"
            className="hidden items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))] sm:inline-flex"
          >
            <ReceiptText className="h-4 w-4" />
            Vendas
          </Link>
          <Link
            href="/admin/bar"
            className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--background-subtle))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground))] hover:opacity-90"
          >
            <ArrowLeft className="h-4 w-4" />
            Sair
          </Link>
        </div>
      </header>

      {/* Faixa PIX pendentes */}
      <section className="shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.65)] px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[rgb(var(--primary))] px-3 py-1 text-xs font-semibold text-white">
              Pendentes ({pendentesTotal})
            </span>
            <Link
              href="/admin/bar/vendas?status=PENDENTE"
              className="text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
            >
              Todas as vendas
            </Link>
          </div>
        </div>
        {pendentes.length === 0 ? (
          <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhum PIX aberto</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pendentes.map((v) => {
              const qtd = v.itens.reduce((n, i) => n + i.quantidade, 0)
              return (
                <div
                  key={v.id}
                  className="flex min-w-[13.5rem] shrink-0 flex-col gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                        {formatarPreco(v.total)}
                      </p>
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">
                        {qtd} {qtd === 1 ? 'item' : 'itens'} · {formatarTempoRelativo(v.criadoEm)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[rgb(var(--color-warning)_/_0.14)] px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--color-warning-fg))]">
                      Aguardando PIX
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={pending || !v.pixCopiaCola}
                      onClick={() => retomarPendente(v)}
                      className="flex-1 rounded-full bg-[rgb(var(--primary))] px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Retomar
                    </button>
                    {podeCancelar && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => cancelarPendenteDaFaixa(v)}
                        className="rounded-full border border-[rgb(var(--color-danger)_/_0.35)] px-2 py-1.5 text-xs font-medium text-[rgb(var(--color-danger-fg))] disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Corpo: menu + sidebar */}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <section className="flex min-h-0 flex-col overflow-hidden border-[rgb(var(--border))] lg:border-r">
          <div className="shrink-0 space-y-3 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[rgb(var(--foreground))]">Cardápio</h2>
              <div className="relative max-w-[14rem] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar…"
                  className="w-full rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2 pl-9 pr-3 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))]"
                />
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setCategoriaId(null)}
                className={[
                  'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                  categoriaId == null
                    ? 'bg-[rgb(var(--primary))] text-white'
                    : 'border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
                ].join(' ')}
              >
                Todos
              </button>
              {categorias.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoriaId(c.id)}
                  className={[
                    'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                    categoriaId === c.id
                      ? 'bg-[rgb(var(--primary))] text-white'
                      : 'border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
                  ].join(' ')}
                >
                  {c.nome}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 lg:pb-4">
            {filtrados.length === 0 ? (
              <MotionEmptyState
                icon={<Beer className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
                title="Nenhum produto"
                description={
                  busca.trim()
                    ? 'Nada encontrado com esse nome.'
                    : 'Cadastre itens em Produtos do bar para vender no PDV.'
                }
                className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center"
              />
            ) : (
              <m.div
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
              >
                {filtrados.map((p) => {
                  const noCarrinho = cart.find((l) => l.produtoId === p.id)?.quantidade ?? 0
                  const disponivel = estoqueDisponivel(p.id, p.estoque)
                  const esgotado = p.estoque <= 0
                  const semMais = esgotado || disponivel <= 0
                  return (
                    <m.div
                      key={p.id}
                      variants={staggerItem}
                      className={[
                        'flex gap-3 overflow-hidden rounded-3xl border p-3',
                        esgotado
                          ? 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-55'
                          : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
                      ].join(' ')}
                    >
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl sm:h-24 sm:w-24">
                        <ProdutoImagem
                          src={p.imagemUrl}
                          alt={p.nome}
                          variant="thumb"
                          className="h-20 w-20 rounded-2xl sm:h-24 sm:w-24"
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                            {p.categoria?.nome ?? 'Geral'}
                          </p>
                          <p className="shrink-0 text-sm font-bold tabular-nums text-[rgb(var(--foreground))]">
                            {formatarPreco(p.preco)}
                          </p>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-[rgb(var(--foreground))]">
                          {p.nome}
                        </p>
                        <p className="mt-auto pt-2 text-xs text-[rgb(var(--foreground-muted))]">
                          {esgotado ? 'Esgotado' : `${p.estoque} un.`}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          {esgotado ? (
                            <span className="text-xs font-medium text-[rgb(var(--foreground-muted))]">
                              Indisponível
                            </span>
                          ) : (
                            <Stepper
                              label={p.nome}
                              value={noCarrinho}
                              onMinus={() => setQtdProduto(p, -1)}
                              onPlus={() => setQtdProduto(p, 1)}
                              minusDisabled={noCarrinho <= 0 || pending}
                              plusDisabled={semMais || noCarrinho >= 99 || pending}
                            />
                          )}
                          {noCarrinho > 0 && (
                            <button
                              type="button"
                              aria-label={`Remover ${p.nome}`}
                              onClick={() => removerLinha(p.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-[rgb(var(--color-danger-fg))] hover:bg-[rgb(var(--color-danger)_/_0.08)]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </m.div>
                  )
                })}
              </m.div>
            )}
          </div>
        </section>

        {/* Sidebar desktop */}
        <aside className="hidden min-h-0 flex-col bg-[rgb(var(--surface)_/_0.9)] p-4 lg:flex">
          {sidebar}
        </aside>
      </div>

      {/* Mobile: sticky comanda + sheet */}
      <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
        {comandaMobileAberta && (
          <div className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-hidden rounded-t-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-2xl">
            <div className="flex justify-end border-b border-[rgb(var(--border))] px-2 py-1">
              <button
                type="button"
                onClick={() => setComandaMobileAberta(false)}
                className="rounded-full p-2 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
                aria-label="Fechar comanda"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[calc(75vh-3rem)] overflow-y-auto p-4">{sidebar}</div>
          </div>
        )}
        {!comandaMobileAberta && cart.length > 0 && (
          <div className="border-t border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.96)] p-3 backdrop-blur">
            <button
              type="button"
              disabled={pending}
              onClick={() => setComandaMobileAberta(true)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-[rgb(var(--primary))] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                Ver comanda
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{qtdItens}</span>
              </span>
              <span className="tabular-nums">{formatarPreco(resumo.total)}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
