'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import {
  Banknote,
  Beer,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  QrCode,
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
import type { BarProdutoSerializado } from '@/lib/bar-serialize'

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

function MetodoIcon({ metodo }: { metodo: Metodo }) {
  if (metodo === 'PIX') return <QrCode className="h-4 w-4" />
  if (metodo === 'DINHEIRO') return <Banknote className="h-4 w-4" />
  return <CreditCard className="h-4 w-4" />
}

export function BarPdv({
  produtos: produtosIniciais,
  categorias,
  podeCancelar,
}: {
  produtos: BarProdutoSerializado[]
  categorias: { id: string; nome: string }[]
  podeCancelar: boolean
}) {
  const router = useRouter()
  const [produtos, setProdutos] = useState(produtosIniciais)
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
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

  const desconto = Math.max(0, Number(descontoStr.replace(',', '.')) || 0)

  const resumo = useMemo(
    () =>
      resumirVenda(
        cart.map((l) => ({ precoUnit: l.preco, quantidade: l.quantidade })),
        desconto,
      ),
    [cart, desconto],
  )

  const filtrados = useMemo(() => {
    if (!categoriaId) return produtos
    return produtos.filter((p) => p.categoria?.id === categoriaId)
  }, [produtos, categoriaId])

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

  function novaVenda() {
    setFase('venda')
    setPix(null)
    setPixItens(null)
    setUltimoTotal(0)
    limparCarrinho()
    setMetodo('DINHEIRO')
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

      if (result.pago) {
        setUltimoTotal(totalPrevisto)
        setFase('sucesso')
        setCart([])
        setDescontoStr('')
        setObservacao('')
        toast.success('Venda registrada', { description: formatarPreco(totalPrevisto) })
        return
      }

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

  const pollPix = useCallback(() => {
    if (!pix) return
    void (async () => {
      const status = await consultarStatusVendaBar(pix.vendaId)
      if (!status.success) return
      if (status.status === 'PAGA') {
        setFase('sucesso')
        setPix(null)
        setPixItens(null)
        toast.success('PIX confirmado', { description: formatarPreco(pix.total) })
      } else if (status.status === 'CANCELADA') {
        if (pixItens) restaurarBaixaLocal(pixItens)
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
      toast.message('Venda cancelada — estoque restaurado.')
      setFase('venda')
      setPix(null)
      setPixItens(null)
      setErro(null)
      router.refresh()
    })
  }

  if (fase === 'sucesso') {
    return (
      <MotionSuccessPanel
        icon={<CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600 dark:text-emerald-400" />}
        title="Venda paga"
        description={formatarPreco(ultimoTotal)}
        className="rounded-2xl border border-[rgb(var(--color-success)_/_0.35)] bg-[rgb(var(--color-success)_/_0.08)] p-8 text-center"
      >
        <button
          type="button"
          onClick={novaVenda}
          className="mt-6 inline-flex rounded-xl bg-[rgb(var(--primary))] px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          Nova venda
        </button>
      </MotionSuccessPanel>
    )
  }

  if (fase === 'pix' && pix) {
    const mock = pix.provider === 'mock'
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
        <div className="text-center">
          <p className="text-sm text-[rgb(var(--foreground-muted))]">Aguardando PIX</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-[rgb(var(--color-primary-fg))]">
            {formatarPreco(pix.total)}
          </p>
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
            className="rounded-xl border border-[rgb(var(--border))] bg-white p-2"
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Pix copia e cola
          </p>
          <p className="break-all rounded-lg bg-[rgb(var(--background-subtle))] p-3 font-mono text-xs text-[rgb(var(--foreground))]">
            {pix.copiaCola}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void copiarPix()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[rgb(var(--border))] px-4 py-2.5 text-sm font-medium hover:bg-[rgb(var(--background-subtle))]"
        >
          <Copy className="h-4 w-4" />
          {copied ? 'Copiado!' : 'Copiar código'}
        </button>

        {mock && (
          <button
            type="button"
            disabled={pending}
            onClick={confirmarMock}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--primary))] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Já paguei (mock)
          </button>
        )}

        {podeCancelar && (
          <button
            type="button"
            disabled={pending}
            onClick={cancelarPix}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-[rgb(var(--color-danger-fg))] hover:bg-[rgb(var(--color-danger)_/_0.08)] disabled:opacity-60"
          >
            <X className="h-4 w-4" />
            Cancelar venda
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-4 pb-24 lg:grid-cols-[minmax(0,1fr)_min(100%,22rem)] lg:items-start lg:pb-0">
      {/* Painel esquerdo — catálogo */}
      <section className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
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

        {filtrados.length === 0 ? (
          <MotionEmptyState
            icon={<Beer className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
            title="Nenhum produto ativo"
            description="Cadastre itens em Produtos do bar para vender no PDV."
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center"
          />
        ) : (
          <m.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4"
          >
            {filtrados.map((p) => {
              const noCarrinho = cart.find((l) => l.produtoId === p.id)?.quantidade ?? 0
              const disponivel = estoqueDisponivel(p.id, p.estoque)
              const esgotado = p.estoque <= 0 || disponivel <= 0
              return (
                <m.button
                  key={p.id}
                  type="button"
                  variants={staggerItem}
                  whileTap={esgotado ? undefined : { scale: 0.97 }}
                  transition={springSnappy}
                  disabled={esgotado || pending}
                  onClick={() => adicionarProduto(p)}
                  className={[
                    'overflow-hidden rounded-2xl border text-left transition-opacity',
                    esgotado
                      ? 'cursor-not-allowed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-50'
                      : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--color-primary)_/_0.45)]',
                  ].join(' ')}
                >
                  <div className="relative">
                    <ProdutoImagem
                      src={p.imagemUrl}
                      alt={p.nome}
                      variant="admin"
                      className="h-28"
                    />
                    {noCarrinho > 0 && (
                      <span className="absolute right-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-[rgb(var(--primary))] px-1.5 text-xs font-bold text-white">
                        {noCarrinho}
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5 p-3">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-[rgb(var(--foreground))]">
                      {p.nome}
                    </p>
                    <p className="text-base font-bold tabular-nums text-[rgb(var(--color-primary-fg))]">
                      {formatarPreco(p.preco)}
                    </p>
                    <p className="text-xs text-[rgb(var(--foreground-muted))]">
                      {esgotado ? 'Esgotado' : `${p.estoque} un.`}
                    </p>
                  </div>
                </m.button>
              )
            })}
          </m.div>
        )}
      </section>

      {/* Painel direito — comanda + pagamento */}
      <aside className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-[rgb(var(--foreground))]">Venda atual</h2>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={limparCarrinho}
              className="text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--color-danger-fg))]"
            >
              Limpar
            </button>
          )}
        </div>

        {cart.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-3 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
            Toque nos produtos para montar a comanda
          </p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border))]">
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
                  className="flex items-center gap-2 overflow-hidden py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                      {l.nome}
                    </p>
                    <p className="text-xs tabular-nums text-[rgb(var(--foreground-muted))]">
                      {formatarPreco(l.preco)} · {formatarPreco(l.preco * l.quantidade)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Diminuir ${l.nome}`}
                      onClick={() => alterarQtd(l.produtoId, -1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[rgb(var(--border))] hover:bg-[rgb(var(--background-subtle))]"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums">
                      {l.quantidade}
                    </span>
                    <button
                      type="button"
                      aria-label={`Aumentar ${l.nome}`}
                      disabled={l.quantidade >= l.estoque || l.quantidade >= 99}
                      onClick={() => alterarQtd(l.produtoId, 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[rgb(var(--border))] hover:bg-[rgb(var(--background-subtle))] disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remover ${l.nome}`}
                      onClick={() => removerLinha(l.produtoId)}
                      className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--color-danger-fg))] hover:bg-[rgb(var(--color-danger)_/_0.08)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        <div className="space-y-2 border-t border-[rgb(var(--border))] pt-3">
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
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm tabular-nums text-[rgb(var(--foreground))]"
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
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
            />
          </label>
        </div>

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-[rgb(var(--foreground-muted))]">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatarPreco(resumo.subtotal)}</span>
          </div>
          {resumo.desconto > 0 && (
            <div className="flex justify-between text-[rgb(var(--foreground-muted))]">
              <span>Desconto</span>
              <span className="tabular-nums">−{formatarPreco(resumo.desconto)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-[rgb(var(--foreground))]">
            <span>Total</span>
            <span className="tabular-nums text-[rgb(var(--color-primary-fg))]">
              {formatarPreco(resumo.total)}
            </span>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-[rgb(var(--foreground-muted))]">Pagamento</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(METODO_PAGAMENTO_BAR as readonly Metodo[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetodo(m)}
                className={[
                  'flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition-colors',
                  metodo === m
                    ? 'bg-[rgb(var(--color-primary)_/_0.16)] text-[rgb(var(--color-primary-fg))] ring-1 ring-[rgb(var(--color-primary)_/_0.45)]'
                    : 'border border-[rgb(var(--border))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
                ].join(' ')}
              >
                <MetodoIcon metodo={m} />
                {METODO_PAGAMENTO_BAR_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        {erro && (
          <p className="rounded-lg bg-[rgb(var(--color-danger)_/_0.1)] px-3 py-2 text-sm text-[rgb(var(--color-danger-fg))]">
            {erro}
          </p>
        )}

        <button
          type="button"
          disabled={pending || cart.length === 0}
          onClick={cobrar}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--primary))] px-4 py-3.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {metodo === 'PIX' ? 'Gerar PIX' : 'Cobrar'} · {formatarPreco(resumo.total)}
        </button>
      </aside>

      {/* Barra sticky mobile — atalho para cobrar */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.96)] p-3 backdrop-blur lg:hidden">
          <button
            type="button"
            disabled={pending}
            onClick={cobrar}
            className="flex w-full items-center justify-between gap-3 rounded-xl bg-[rgb(var(--primary))] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50"
          >
            <span className="flex items-center gap-2">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {metodo === 'PIX' ? 'Gerar PIX' : 'Cobrar'}
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{cart.reduce((n, l) => n + l.quantidade, 0)}</span>
            </span>
            <span className="tabular-nums">{formatarPreco(resumo.total)}</span>
          </button>
        </div>
      )}
    </div>
  )
}
