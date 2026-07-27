'use client'

import { useCallback, useMemo, useState, useSyncExternalStore, useTransition } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import {
  ArrowLeft,
  Banknote,
  Beer,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  HandCoins,
  Loader2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
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
  if (metodo === 'FIADO') return <HandCoins className="h-4 w-4" />
  return <CreditCard className="h-4 w-4" />
}

function Stepper({
  value,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
  label,
  size = 'md',
}: {
  value: number
  onMinus: () => void
  onPlus: () => void
  minusDisabled?: boolean
  plusDisabled?: boolean
  label: string
  size?: 'md' | 'lg'
}) {
  const btn = size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'
  const icon = size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'
  const qty = size === 'lg' ? 'min-w-9 text-base' : 'min-w-8 text-sm'
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-0.5 shadow-sm">
      <button
        type="button"
        aria-label={`Diminuir ${label}`}
        disabled={minusDisabled}
        onClick={(e) => {
          e.stopPropagation()
          onMinus()
        }}
        className={[
          'flex items-center justify-center rounded-full text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-35',
          btn,
        ].join(' ')}
      >
        <Minus className={icon} />
      </button>
      <span
        className={['text-center font-bold tabular-nums text-[rgb(var(--foreground))]', qty].join(
          ' ',
        )}
      >
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
        className={[
          'flex items-center justify-center rounded-full bg-[rgb(var(--primary))] text-[rgb(var(--color-primary-fg))] transition-opacity hover:opacity-90 disabled:opacity-35',
          btn,
        ].join(' ')}
      >
        <Plus className={icon} />
      </button>
    </div>
  )
}

// Preferência (expandido/recolhido) do menu de turno, persistida em localStorage.
// useSyncExternalStore mantém SSR/hidratação consistentes sem setState em effect.
const TURNO_SIDEBAR_KEY = 'bar-pdv-turno-sidebar'
const turnoSidebarListeners = new Set<() => void>()

function turnoSidebarSubscribe(listener: () => void) {
  turnoSidebarListeners.add(listener)
  return () => turnoSidebarListeners.delete(listener)
}

function turnoSidebarSnapshot() {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(TURNO_SIDEBAR_KEY) !== '0'
  } catch {
    return true
  }
}

function turnoSidebarServerSnapshot() {
  return true
}

function setTurnoSidebarStored(value: boolean) {
  try {
    window.localStorage.setItem(TURNO_SIDEBAR_KEY, value ? '1' : '0')
  } catch {
    // ignore
  }
  turnoSidebarListeners.forEach((l) => l())
}

/** Data padrão de vencimento do fiado: hoje + 7 dias, em `yyyy-mm-dd` para `<input type="date">`. */
function vencimentoFiadoPadrao(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

export function BarPdv({
  produtos: produtosIniciais,
  categorias,
  pendentes: pendentesIniciais,
  pendentesTotal: pendentesTotalInicial,
  unidadeNome,
  podeCancelar,
  podeGerir = podeCancelar,
  membrosFiado = [],
  turnoAberto = true,
  turnoPainel,
}: {
  produtos: BarProdutoSerializado[]
  categorias: { id: string; nome: string }[]
  pendentes: BarVendaSerializada[]
  pendentesTotal: number
  unidadeNome: string
  podeCancelar: boolean
  /** Conceder fiado exige `bar:manage` (mesmo que operar o PDV só precise de `bar:operate`). */
  podeGerir?: boolean
  /** Membros aprovados da unidade — devedor do fiado (só carregado quando `podeGerir`). */
  membrosFiado?: { id: string; nome: string }[]
  /** Sem turno aberto o PDV não registra novas vendas. */
  turnoAberto?: boolean
  /** Painel de turno (abrir/fechar caixa) exibido no menu lateral colapsável. */
  turnoPainel: ReactNode
}) {
  const router = useRouter()
  const [produtos, setProdutos] = useState(produtosIniciais)
  const [pendentes, setPendentes] = useState(pendentesIniciais)
  const [pendentesTotal, setPendentesTotal] = useState(pendentesTotalInicial)
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [metodo, setMetodo] = useState<Metodo>('DINHEIRO')
  const [membroIdFiado, setMembroIdFiado] = useState('')
  const [vencimentoFiado, setVencimentoFiado] = useState(vencimentoFiadoPadrao)
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
  const [opcoesAbertas, setOpcoesAbertas] = useState(false)
  const turnoSidebarAberto = useSyncExternalStore(
    turnoSidebarSubscribe,
    turnoSidebarSnapshot,
    turnoSidebarServerSnapshot,
  )
  const [turnoDrawerAberto, setTurnoDrawerAberto] = useState(false)

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
    setMembroIdFiado('')
    setVencimentoFiado(vencimentoFiadoPadrao())
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
    if (metodo === 'FIADO') {
      if (!podeGerir) {
        setErro('Fiado requer permissão de gestor')
        return
      }
      if (!membroIdFiado) {
        setErro('Selecione o membro devedor do fiado')
        return
      }
      if (!vencimentoFiado) {
        setErro('Informe o vencimento do fiado')
        return
      }
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
        ...(metodo === 'FIADO'
          ? { membroId: membroIdFiado, vencimento: vencimentoFiado }
          : {}),
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
        fiadoStatus: null,
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

  // @container: a comanda é renderizada tanto no aside (19–28rem) quanto no
  // bottom sheet mobile. Breakpoint de viewport aqui mentia — `sm:grid-cols-2`
  // valia num aside de 19rem e espremia os campos.
  const sidebar = (
    <div className="@container flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 pb-3">
        <div>
          <h2 className="text-lg font-semibold text-[rgb(var(--foreground))]">Venda atual</h2>
          {qtdItens > 0 && (
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              {qtdItens} {qtdItens === 1 ? 'item' : 'itens'}
            </p>
          )}
        </div>
        {cart.length > 0 && (
          <button
            type="button"
            onClick={limparCarrinho}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-danger-fg))] hover:bg-[rgb(var(--color-danger)_/_0.1)]"
          >
            Limpar
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex h-full min-h-[8rem] flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background)_/_0.45)] px-4 py-6 text-center">
            <Beer className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm font-medium text-[rgb(var(--foreground))]">Comanda vazia</p>
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
              Toque no + do cardápio para adicionar
            </p>
          </div>
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
                  className="flex items-center gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                      {l.nome}
                    </p>
                    <p className="text-xs tabular-nums text-[rgb(var(--foreground-muted))]">
                      {formatarPreco(l.preco)}
                      <span className="mx-1 opacity-40">·</span>
                      <span className="font-medium text-[rgb(var(--color-primary-fg))]">
                        {formatarPreco(l.preco * l.quantidade)}
                      </span>
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
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[rgb(var(--color-danger-fg))] hover:bg-[rgb(var(--color-danger)_/_0.1)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <div className="mt-3 shrink-0 space-y-3 border-t border-[rgb(var(--border))] pt-3">
        <button
          type="button"
          onClick={() => setOpcoesAbertas((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-xs font-semibold text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <span>Desconto e observação</span>
          <span>{opcoesAbertas || desconto > 0 || observacao ? '−' : '+'}</span>
        </button>
        {(opcoesAbertas || desconto > 0 || observacao) && (
          <div className="@[22rem]:grid-cols-2 grid grid-cols-1 gap-2">
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
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Pagamento
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(METODO_PAGAMENTO_BAR as readonly Metodo[]).map((m) => {
              const bloqueado = m === 'FIADO' && !podeGerir
              return (
                <button
                  key={m}
                  type="button"
                  disabled={bloqueado}
                  title={bloqueado ? 'Fiado requer permissão de gestor' : undefined}
                  onClick={() => !bloqueado && setMetodo(m)}
                  className={[
                    'flex min-h-11 items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-xs font-semibold transition-colors',
                    bloqueado
                      ? 'cursor-not-allowed border border-[rgb(var(--border))] bg-[rgb(var(--background))] text-[rgb(var(--foreground-muted))] opacity-50'
                      : metodo === m
                        ? 'bg-[rgb(var(--primary))] text-[rgb(var(--color-primary-fg))] shadow-sm'
                        : 'border border-[rgb(var(--border))] bg-[rgb(var(--background))] text-[rgb(var(--foreground))] hover:border-[rgb(var(--color-primary)_/_0.4)] hover:bg-[rgb(var(--background-subtle))]',
                  ].join(' ')}
                >
                  <MetodoIcon metodo={m} />
                  {METODO_PAGAMENTO_BAR_LABEL[m]}
                </button>
              )
            })}
          </div>
          {metodo === 'FIADO' && !podeGerir && (
            <p className="mt-1.5 text-xs text-[rgb(var(--foreground-muted))]">
              Fiado requer permissão de gestor.
            </p>
          )}
        </div>

        {metodo === 'FIADO' && podeGerir && (
          <div className="@[22rem]:grid-cols-2 grid grid-cols-1 gap-2 rounded-2xl border border-[rgb(var(--color-warning)_/_0.35)] bg-[rgb(var(--color-warning)_/_0.06)] p-3">
            <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Devedor *
              <select
                value={membroIdFiado}
                onChange={(e) => setMembroIdFiado(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm text-[rgb(var(--foreground))]"
              >
                <option value="">Selecione o membro</option>
                {membrosFiado.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Vencimento *
              <input
                type="date"
                value={vencimentoFiado}
                onChange={(e) => setVencimentoFiado(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2.5 text-sm text-[rgb(var(--foreground))]"
              />
            </label>
          </div>
        )}

        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-3">
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
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-[rgb(var(--foreground))]">Total</span>
            <span className="text-2xl font-bold tabular-nums text-[rgb(var(--color-primary-fg))]">
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
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[rgb(var(--primary))] px-4 py-4 text-base font-bold text-[rgb(var(--color-primary-fg))] shadow-md hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[rgb(var(--background-subtle))] disabled:text-[rgb(var(--foreground-muted))] disabled:opacity-100 disabled:shadow-none"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {metodo === 'PIX' ? 'Gerar PIX' : 'Cobrar'}
          {cart.length > 0 && (
            <span className="tabular-nums opacity-90">· {formatarPreco(resumo.total)}</span>
          )}
        </button>
      </div>
    </div>
  )

  const turnoStatusDot = (
    <span
      className={[
        'h-2 w-2 shrink-0 rounded-full',
        turnoAberto
          ? 'bg-[rgb(var(--color-success-fg))]'
          : 'bg-[rgb(var(--foreground-muted))]',
      ].join(' ')}
    />
  )

  const turnoSidebar = (
    <aside
      className={[
        'relative hidden shrink-0 flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))] transition-[width] duration-300 ease-out lg:flex',
        turnoSidebarAberto ? 'w-[19rem] 2xl:w-[21rem]' : 'w-14',
      ].join(' ')}
    >
      {turnoSidebarAberto ? (
        <>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-4 py-3">
            <div className="flex items-center gap-2">
              {turnoStatusDot}
              <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Turno</h2>
            </div>
            <button
              type="button"
              onClick={() => setTurnoSidebarStored(false)}
              aria-label="Recolher menu de turno"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">{turnoPainel}</div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setTurnoSidebarStored(true)}
          aria-label="Expandir menu de turno"
          className="flex h-full w-full flex-col items-center gap-3 py-3 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgb(var(--border))]">
            <PanelLeftOpen className="h-4 w-4" />
          </span>
          {turnoStatusDot}
          <span className="mt-1 flex rotate-180 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider [writing-mode:vertical-rl]">
            <Clock className="h-3.5 w-3.5" />
            Turno
          </span>
        </button>
      )}
    </aside>
  )

  const turnoDrawer = turnoDrawerAberto ? (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Fechar menu de turno"
        className="absolute inset-0 bg-black/40"
        onClick={() => setTurnoDrawerAberto(false)}
      />
      <div className="absolute inset-y-0 left-0 flex w-[85vw] max-w-sm flex-col bg-[rgb(var(--surface))] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-4 py-3">
          <div className="flex items-center gap-2">
            {turnoStatusDot}
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Turno</h2>
          </div>
          <button
            type="button"
            onClick={() => setTurnoDrawerAberto(false)}
            aria-label="Fechar menu de turno"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{turnoPainel}</div>
      </div>
    </div>
  ) : null

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
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
            PDV Bar
          </p>
          <h1 className="truncate text-base font-bold text-[rgb(var(--foreground))] sm:text-lg">
            {unidadeNome}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setTurnoDrawerAberto(true)}
            aria-label="Abrir menu de turno"
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))] lg:hidden"
          >
            <Clock className="h-4 w-4" />
            {turnoStatusDot}
          </button>
          {pendentesTotal > 0 ? (
            <span className="hidden items-center rounded-full bg-[rgb(var(--color-warning)_/_0.16)] px-2.5 py-1 text-xs font-semibold text-[rgb(var(--color-warning-fg))] sm:inline-flex">
              {pendentesTotal} PIX
            </span>
          ) : null}
          <Link
            href="/admin/bar/vendas"
            className="hidden items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))] sm:inline-flex"
          >
            <ReceiptText className="h-4 w-4" />
            Vendas
          </Link>
          <Link
            href="/admin/bar"
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
          >
            <ArrowLeft className="h-4 w-4" />
            Sair
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {turnoSidebar}
        <div className="flex min-h-0 flex-1 flex-col">
      {!turnoAberto ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <MotionEmptyState
            icon={<Beer className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
            title="Turno fechado"
            description="Abra o turno de caixa no menu de turno (ou no hub do Bar) para registrar vendas."
            className="flex max-w-md flex-col items-center text-center"
          />
        </div>
      ) : (
        <>
      {pendentes.length > 0 && (
        <section className="shrink-0 border-b border-[rgb(var(--border))] bg-[rgb(var(--color-warning)_/_0.06)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-warning-fg))]">
              PIX pendentes ({pendentesTotal})
            </span>
            <Link
              href="/admin/bar/vendas?status=PENDENTE"
              className="text-xs font-medium text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
            >
              Ver todas
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {pendentes.map((v) => {
              const qtd = v.itens.reduce((n, i) => n + i.quantidade, 0)
              return (
                <div
                  key={v.id}
                  className="flex min-w-[14rem] shrink-0 flex-col gap-2 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold tabular-nums text-[rgb(var(--foreground))]">
                        {formatarPreco(v.total)}
                      </p>
                      <p className="text-xs text-[rgb(var(--foreground-muted))]">
                        {qtd} {qtd === 1 ? 'item' : 'itens'} · {formatarTempoRelativo(v.criadoEm)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[rgb(var(--color-warning)_/_0.18)] px-2 py-0.5 text-[10px] font-bold text-[rgb(var(--color-warning-fg))]">
                      Aguardando
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={pending || !v.pixCopiaCola}
                      onClick={() => retomarPendente(v)}
                      className="flex-1 rounded-full bg-[rgb(var(--primary))] px-2 py-2 text-xs font-bold text-[rgb(var(--color-primary-fg))] disabled:opacity-50"
                    >
                      Retomar
                    </button>
                    {podeCancelar && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => cancelarPendenteDaFaixa(v)}
                        className="rounded-full border border-[rgb(var(--color-danger)_/_0.35)] px-2.5 py-2 text-xs font-semibold text-[rgb(var(--color-danger-fg))] disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* A comanda só chega a 28rem em telas ≥1536px: em notebook ela roubava
          448px do cardápio e sobrava largura para uma coluna de produtos. */}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
        <section className="flex min-h-0 flex-col overflow-hidden border-[rgb(var(--border))] lg:border-r">
          <div className="shrink-0 space-y-2.5 px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar no cardápio…"
                className="w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2.5 pl-10 pr-3 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary)_/_0.5)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary)_/_0.2)]"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setCategoriaId(null)}
                className={[
                  'shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                  categoriaId == null
                    ? 'bg-[rgb(var(--primary))] text-[rgb(var(--color-primary-fg))]'
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
                    'shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                    categoriaId === c.id
                      ? 'bg-[rgb(var(--primary))] text-[rgb(var(--color-primary-fg))]'
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
              // Colunas por largura real do painel, não por viewport: as duas sidebars
              // (turno + comanda) comem 600–800px, então `xl:grid-cols-3` produzia cards
              // de ~230px — estreitos demais para o Stepper (132px) e o preço.
              <m.div
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="grid grid-cols-[repeat(auto-fill,minmax(min(17rem,100%),1fr))] gap-3"
              >
                {filtrados.map((p) => {
                  const noCarrinho = cart.find((l) => l.produtoId === p.id)?.quantidade ?? 0
                  const disponivel = estoqueDisponivel(p.id, p.estoque)
                  const esgotado = p.estoque <= 0
                  const semMais = esgotado || disponivel <= 0
                  const estoqueBaixo =
                    !esgotado && p.estoqueMinimo != null && p.estoque <= p.estoqueMinimo
                  return (
                    // Card is a div (not a button): Stepper/Remover nest real <button>s;
                    // nested buttons make the browser close the outer early and shatter the grid.
                    <m.div
                      key={p.id}
                      variants={staggerItem}
                      whileTap={esgotado || pending || semMais ? undefined : { scale: 0.985 }}
                      transition={springSnappy}
                      onClick={() => {
                        if (!semMais && !pending) setQtdProduto(p, 1)
                      }}
                      className={[
                        'flex min-w-0 flex-col gap-3 overflow-hidden rounded-3xl border p-3 text-left transition-colors',
                        esgotado
                          ? 'cursor-not-allowed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-50'
                          : noCarrinho > 0
                            ? 'cursor-pointer border-[rgb(var(--color-primary)_/_0.55)] bg-[rgb(var(--color-primary)_/_0.08)] ring-1 ring-[rgb(var(--color-primary)_/_0.25)]'
                            : 'cursor-pointer border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--color-primary)_/_0.35)]',
                      ].join(' ')}
                    >
                      <div className="flex min-w-0 gap-3">
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[rgb(var(--background-subtle))] sm:h-24 sm:w-24">
                          <ProdutoImagem
                            src={p.imagemUrl}
                            alt={p.nome}
                            variant="thumb"
                            className="!h-full !w-full !rounded-2xl"
                          />
                          {noCarrinho > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-7 min-w-7 items-center justify-center rounded-full bg-[rgb(var(--primary))] px-1.5 text-xs font-bold text-[rgb(var(--color-primary-fg))] shadow">
                              {noCarrinho}
                            </span>
                          )}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                              {p.categoria?.nome ?? 'Geral'}
                            </p>
                            <p className="shrink-0 text-base font-bold tabular-nums text-[rgb(var(--color-primary-fg))]">
                              {formatarPreco(p.preco)}
                            </p>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-[rgb(var(--foreground))]">
                            {p.nome}
                          </p>
                          <p
                            className={[
                              'mt-1 text-xs font-medium',
                              esgotado
                                ? 'text-[rgb(var(--color-danger-fg))]'
                                : estoqueBaixo
                                  ? 'text-[rgb(var(--color-warning-fg))]'
                                  : 'text-[rgb(var(--foreground-muted))]',
                            ].join(' ')}
                          >
                            {esgotado
                              ? 'Esgotado'
                              : estoqueBaixo
                                ? `Baixo · ${p.estoque} un.`
                                : `${p.estoque} un.`}
                          </p>
                        </div>
                      </div>
                      {/* Ações ocupam a largura inteira do card: dentro da coluna de texto
                          elas dividiam espaço com a imagem e o Stepper (132px fixos)
                          estourava a borda em telas de notebook. */}
                      <div
                        className="mt-auto flex items-center justify-between gap-2"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="presentation"
                      >
                        {esgotado ? (
                          <span className="text-xs font-medium text-[rgb(var(--foreground-muted))]">
                            Indisponível
                          </span>
                        ) : (
                          <Stepper
                            size="lg"
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
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[rgb(var(--color-danger-fg))] hover:bg-[rgb(var(--color-danger)_/_0.1)]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </m.div>
                  )
                })}
              </m.div>
            )}
          </div>
        </section>

        <aside className="hidden min-h-0 flex-col bg-[rgb(var(--surface))] p-4 lg:flex lg:shadow-[-8px_0_24px_rgb(0_0_0_/_0.12)]">
          {sidebar}
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
        {comandaMobileAberta && (
          <>
            <button
              type="button"
              aria-label="Fechar comanda"
              className="absolute inset-0 -top-[100vh] bg-black/40"
              onClick={() => setComandaMobileAberta(false)}
            />
            <div className="relative max-h-[78vh] overflow-hidden rounded-t-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-2xl">
              <div className="relative flex items-center justify-center border-b border-[rgb(var(--border))] px-4 py-2">
                <div className="h-1 w-10 rounded-full bg-[rgb(var(--border))]" />
                <button
                  type="button"
                  onClick={() => setComandaMobileAberta(false)}
                  className="absolute right-2 top-1 rounded-full p-2 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
                  aria-label="Fechar comanda"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="max-h-[calc(78vh-2.5rem)] overflow-y-auto p-4">{sidebar}</div>
            </div>
          </>
        )}
        {!comandaMobileAberta && cart.length > 0 && (
          <div className="border-t border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.97)] p-3 backdrop-blur">
            <button
              type="button"
              disabled={pending}
              onClick={() => setComandaMobileAberta(true)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-[rgb(var(--primary))] px-4 py-3.5 text-sm font-bold text-[rgb(var(--color-primary-fg))] disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                Ver comanda
                <span className="rounded-full bg-black/15 px-2 py-0.5 text-xs">{qtdItens}</span>
              </span>
              <span className="tabular-nums">{formatarPreco(resumo.total)}</span>
            </button>
          </div>
        )}
      </div>
        </>
      )}
        </div>
      </div>

      {turnoDrawer}
    </div>
  )
}
