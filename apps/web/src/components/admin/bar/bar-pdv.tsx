'use client'

import { useCallback, useMemo, useState, useSyncExternalStore, useTransition } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import {
  ArrowLeft,
  Banknote,
  Beer,
  CheckCircle2,
  ChevronDown,
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
import { cartItemExit, springSnappy } from '@/lib/motion-presets'
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

/** Resumo do turno exibido no topbar quando a trilha lateral não cabe. */
export type BarPdvTurnoResumo = {
  totalPago: number
  quantidadePaga: number
  dinheiroEsperado: number
  pendentes: number
}

/** Rótulo curto do método: no rodapé da comanda (21rem) "Cartão de crédito" quebra. */
const METODO_LABEL_CURTO: Record<string, string> = {
  PIX: 'PIX',
  DINHEIRO: 'Dinheiro',
  CARTAO_DEBITO: 'Débito',
  CARTAO_CREDITO: 'Crédito',
  FIADO: 'Fiado',
}

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
}: {
  value: number
  onMinus: () => void
  onPlus: () => void
  minusDisabled?: boolean
  plusDisabled?: boolean
  label: string
}) {
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-0.5">
      <button
        type="button"
        aria-label={`Diminuir ${label}`}
        disabled={minusDisabled}
        onClick={(e) => {
          e.stopPropagation()
          onMinus()
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-35"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-7 text-center text-sm font-bold tabular-nums text-[rgb(var(--foreground))]">
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
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--primary))] text-[rgb(var(--color-primary-fg))] transition-opacity hover:opacity-90 disabled:opacity-35"
      >
        <Plus className="h-3.5 w-3.5" />
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
  turnoResumo = null,
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
  /** Números do turno no topbar — o caixa não fica invisível quando a trilha lateral recolhe. */
  turnoResumo?: BarPdvTurnoResumo | null
  /** Painel de turno (abrir/fechar caixa) exibido na trilha lateral colapsável. */
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

  const opcoesVisiveis = opcoesAbertas || desconto > 0 || observacao.length > 0

  // @container: a comanda é renderizada tanto na coluna fixa (21–25rem) quanto no
  // bottom sheet das telas estreitas. Breakpoint de viewport aqui mentia —
  // `sm:grid-cols-2` valia numa coluna de 21rem e espremia os campos.
  const sidebar = (
    <div className="@container flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-baseline justify-between gap-2 pb-2.5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[rgb(var(--foreground))]">
          Comanda
          {qtdItens > 0 && (
            <span className="ml-2 rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-xs font-bold tabular-nums tracking-normal text-[rgb(var(--foreground-muted))]">
              {qtdItens}
            </span>
          )}
        </h2>
        {cart.length > 0 && (
          <button
            type="button"
            onClick={limparCarrinho}
            className="rounded-full px-2 py-1 text-xs font-semibold text-[rgb(var(--color-danger-fg))] transition-colors hover:bg-[rgb(var(--color-danger)_/_0.1)]"
          >
            Limpar
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex h-full min-h-[7rem] flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-6 text-center">
            <Beer className="mb-2 h-7 w-7 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Comanda vazia</p>
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
              Toque num item do cardápio para lançar
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
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
                  className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[13px] font-semibold leading-tight text-[rgb(var(--foreground))]"
                      title={l.nome}
                    >
                      {l.nome}
                    </p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-[rgb(var(--foreground-muted))]">
                      {formatarPreco(l.preco)}
                      <span className="mx-1 opacity-40">·</span>
                      <span className="font-bold text-[rgb(var(--color-primary-fg))]">
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
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--color-danger)_/_0.1)] hover:text-[rgb(var(--color-danger-fg))]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <div className="mt-2.5 shrink-0 space-y-2.5 border-t border-[rgb(var(--border))] pt-2.5">
        <button
          type="button"
          onClick={() => setOpcoesAbertas((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-xs font-semibold text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          <span>
            Desconto e observação
            {desconto > 0 && (
              <span className="ml-2 tabular-nums text-[rgb(var(--color-primary-fg))]">
                −{formatarPreco(desconto)}
              </span>
            )}
          </span>
          <ChevronDown
            className={[
              'h-4 w-4 transition-transform duration-200',
              opcoesVisiveis ? 'rotate-180' : '',
            ].join(' ')}
          />
        </button>
        {opcoesVisiveis && (
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
                className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm tabular-nums text-[rgb(var(--foreground))] focus:border-[rgb(var(--color-primary)_/_0.5)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary)_/_0.2)]"
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
                className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] focus:border-[rgb(var(--color-primary)_/_0.5)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary)_/_0.2)]"
              />
            </label>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Pagamento
          </p>
          <div className="@[19rem]:grid-cols-3 grid grid-cols-2 gap-1.5">
            {(METODO_PAGAMENTO_BAR as readonly Metodo[]).map((m) => {
              const bloqueado = m === 'FIADO' && !podeGerir
              return (
                <button
                  key={m}
                  type="button"
                  disabled={bloqueado}
                  aria-pressed={metodo === m}
                  title={
                    bloqueado
                      ? 'Fiado requer permissão de gestor'
                      : METODO_PAGAMENTO_BAR_LABEL[m]
                  }
                  onClick={() => !bloqueado && setMetodo(m)}
                  className={[
                    'flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-semibold leading-none transition-colors',
                    bloqueado
                      ? 'cursor-not-allowed border border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] opacity-50'
                      : metodo === m
                        ? 'bg-[rgb(var(--primary))] text-[rgb(var(--color-primary-fg))]'
                        : 'border border-[rgb(var(--border))] bg-[rgb(var(--background))] text-[rgb(var(--foreground))] hover:border-[rgb(var(--color-primary)_/_0.4)] hover:bg-[rgb(var(--background-subtle))]',
                  ].join(' ')}
                >
                  <MetodoIcon metodo={m} />
                  {METODO_LABEL_CURTO[m] ?? METODO_PAGAMENTO_BAR_LABEL[m]}
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
          <div className="@[22rem]:grid-cols-2 grid grid-cols-1 gap-2 rounded-xl border border-[rgb(var(--color-warning)_/_0.35)] bg-[rgb(var(--color-warning)_/_0.06)] p-2.5">
            <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Devedor *
              <select
                value={membroIdFiado}
                onChange={(e) => setMembroIdFiado(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2.5 py-2 text-sm text-[rgb(var(--foreground))]"
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
                className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2.5 py-2 text-sm text-[rgb(var(--foreground))]"
              />
            </label>
          </div>
        )}

        <div className="rounded-xl bg-[rgb(var(--background-subtle))] px-3 py-2.5">
          <div className="flex justify-between text-xs text-[rgb(var(--foreground-muted))]">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatarPreco(resumo.subtotal)}</span>
          </div>
          {resumo.desconto > 0 && (
            <div className="mt-1 flex justify-between text-xs text-[rgb(var(--foreground-muted))]">
              <span>Desconto</span>
              <span className="tabular-nums">−{formatarPreco(resumo.desconto)}</span>
            </div>
          )}
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Total
            </span>
            <span className="text-[1.75rem] font-bold leading-none tabular-nums text-[rgb(var(--foreground))]">
              {formatarPreco(resumo.total)}
            </span>
          </div>
        </div>

        {erro && (
          <p
            role="alert"
            className="rounded-xl bg-[rgb(var(--color-danger)_/_0.1)] px-3 py-2 text-sm text-[rgb(var(--color-danger-fg))]"
          >
            {erro}
          </p>
        )}

        <button
          type="button"
          disabled={pending || cart.length === 0}
          onClick={cobrar}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--primary))] px-4 py-3.5 text-base font-bold text-[rgb(var(--color-primary-fg))] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[rgb(var(--background-subtle))] disabled:text-[rgb(var(--foreground-muted))] disabled:opacity-100"
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

  // Trilha de turno: só entra quando o frame tem largura de sobra (≥82rem). Abaixo
  // disso a comanda tem prioridade e o turno vira drawer pelo chip do topbar.
  const turnoSidebar = (
    <aside
      className={[
        'relative hidden shrink-0 flex-col border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))] transition-[width] duration-300 ease-out @[82rem]/pdv:flex',
        turnoSidebarAberto ? 'w-[16rem] @[100rem]/pdv:w-[18rem]' : 'w-12',
      ].join(' ')}
    >
      {turnoSidebarAberto ? (
        <>
          <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-3">
            <div className="flex items-center gap-2">
              {turnoStatusDot}
              <h2 className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--foreground))]">
                Turno
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setTurnoSidebarStored(false)}
              aria-label="Recolher trilha de turno"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
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
          aria-label="Expandir trilha de turno"
          className="flex h-full w-full flex-col items-center gap-3 py-3 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgb(var(--border))]">
            <PanelLeftOpen className="h-4 w-4" />
          </span>
          {turnoStatusDot}
          <span className="mt-1 flex rotate-180 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider [writing-mode:vertical-rl]">
            <Clock className="h-3.5 w-3.5" />
            Turno
          </span>
        </button>
      )}
    </aside>
  )

  const turnoDrawer = turnoDrawerAberto ? (
    <div className="absolute inset-0 z-50 @[82rem]/pdv:hidden">
      <button
        type="button"
        aria-label="Fechar painel de turno"
        className="absolute inset-0 bg-black/50"
        onClick={() => setTurnoDrawerAberto(false)}
      />
      <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-[rgb(var(--surface))] shadow-2xl">
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[rgb(var(--border))] px-3">
          <div className="flex items-center gap-2">
            {turnoStatusDot}
            <h2 className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--foreground))]">
              Turno
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setTurnoDrawerAberto(false)}
            aria-label="Fechar painel de turno"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{turnoPainel}</div>
      </div>
    </div>
  ) : null

  if (fase === 'sucesso') {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[rgb(var(--background))] p-6">
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
            autoFocus
            onClick={novaVenda}
            className="mt-6 inline-flex rounded-xl bg-[rgb(var(--primary))] px-6 py-3 text-sm font-bold text-[rgb(var(--color-primary-fg))] transition-opacity hover:opacity-90"
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
      <div className="flex h-full min-h-0 flex-col bg-[rgb(var(--background))]">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[rgb(var(--color-warning-fg))]">
              Aguardando PIX
            </p>
            <p className="text-lg font-bold leading-tight tabular-nums text-[rgb(var(--foreground))]">
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
            className="rounded-full border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            Voltar ao PDV
          </button>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
            <p className="flex items-center justify-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Confirmando automaticamente…
            </p>

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
              <p className="break-all rounded-xl bg-[rgb(var(--background-subtle))] p-3 font-mono text-xs text-[rgb(var(--foreground))]">
                {pix.copiaCola}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void copiarPix()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[rgb(var(--border))] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[rgb(var(--background-subtle))]"
            >
              <Copy className="h-4 w-4" />
              {copied ? 'Copiado!' : 'Copiar código'}
            </button>

            {mock && (
              <button
                type="button"
                disabled={pending}
                onClick={confirmarMock}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--primary))] px-4 py-3 text-sm font-bold text-[rgb(var(--color-primary-fg))] disabled:opacity-60"
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
                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-[rgb(var(--color-danger-fg))] transition-colors hover:bg-[rgb(var(--color-danger)_/_0.08)] disabled:opacity-60"
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
    // @container/pdv: o PDV é um frame imersivo com duas colunas laterais. Quem
    // decide o layout é a largura real do frame, não a da viewport — o mesmo
    // painel vive em notebook, TV do balcão e tablet, e `lg:` mentia nos três.
    <div className="@container/pdv relative flex h-full min-h-0 flex-col overflow-hidden bg-[rgb(var(--background))]">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--foreground-muted))]">
            PDV Bar
          </p>
          <h1 className="truncate text-sm font-bold leading-tight text-[rgb(var(--foreground))] @[48rem]/pdv:text-base">
            {unidadeNome}
          </h1>
        </div>

        {/* Números do caixa no topbar: a trilha de turno some abaixo de 82rem. */}
        {turnoResumo && (
          <div className="hidden items-center gap-4 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-1.5 @[56rem]/pdv:flex @[82rem]/pdv:hidden">
            <span className="flex items-center gap-2">
              {turnoStatusDot}
              <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
                Turno
              </span>
            </span>
            <span className="text-sm font-bold tabular-nums text-[rgb(var(--foreground))]">
              {formatarPreco(turnoResumo.totalPago)}
              <span className="ml-1 text-[11px] font-medium text-[rgb(var(--foreground-muted))]">
                · {turnoResumo.quantidadePaga}{' '}
                {turnoResumo.quantidadePaga === 1 ? 'venda' : 'vendas'}
              </span>
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setTurnoDrawerAberto(true)}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-[rgb(var(--border))] px-3 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] @[82rem]/pdv:hidden"
        >
          <Clock className="h-4 w-4" />
          {turnoStatusDot}
          <span className="hidden @[34rem]/pdv:inline">Turno</span>
        </button>

        {pendentesTotal > 0 ? (
          <span
            title={`${pendentesTotal} PIX aguardando confirmação`}
            className="hidden h-10 items-center rounded-full bg-[rgb(var(--color-warning)_/_0.16)] px-3 text-xs font-bold text-[rgb(var(--color-warning-fg))] @[42rem]/pdv:inline-flex"
          >
            {pendentesTotal} PIX
          </span>
        ) : null}

        <Link
          href="/admin/bar/vendas"
          className="hidden h-10 items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] @[42rem]/pdv:inline-flex"
        >
          <ReceiptText className="h-4 w-4" />
          Vendas
        </Link>
        <Link
          href="/admin/bar"
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Sair
        </Link>
      </header>

      <div className="flex min-h-0 flex-1">
        {turnoSidebar}

        {!turnoAberto ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <MotionEmptyState
              icon={<Beer className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
              title="Turno fechado"
              description="Abra o turno de caixa no painel de turno (ou no hub do Bar) para registrar vendas."
              className="flex max-w-md flex-col items-center text-center"
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* Cardápio */}
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              {pendentes.length > 0 && (
                <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[rgb(var(--border))] bg-[rgb(var(--color-warning)_/_0.07)] px-3 py-2">
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-warning-fg))]">
                    PIX pendente · {pendentesTotal}
                  </span>
                  {pendentes.map((v) => {
                    const qtd = v.itens.reduce((n, i) => n + i.quantidade, 0)
                    return (
                      <div
                        key={v.id}
                        title={`${qtd} ${qtd === 1 ? 'item' : 'itens'} · criada ${formatarTempoRelativo(v.criadoEm)}`}
                        className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-[rgb(var(--color-warning)_/_0.35)] bg-[rgb(var(--surface))] pl-3 pr-1"
                      >
                        <span className="text-xs font-bold tabular-nums text-[rgb(var(--foreground))]">
                          {formatarPreco(v.total)}
                        </span>
                        <span className="text-[11px] tabular-nums text-[rgb(var(--foreground-muted))]">
                          {formatarTempoRelativo(v.criadoEm)}
                        </span>
                        <button
                          type="button"
                          disabled={pending || !v.pixCopiaCola}
                          onClick={() => retomarPendente(v)}
                          className="h-7 rounded-full bg-[rgb(var(--primary))] px-2.5 text-[11px] font-bold text-[rgb(var(--color-primary-fg))] transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          Retomar
                        </button>
                        {podeCancelar && (
                          <button
                            type="button"
                            disabled={pending}
                            aria-label={`Cancelar venda de ${formatarPreco(v.total)}`}
                            onClick={() => cancelarPendenteDaFaixa(v)}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--color-danger)_/_0.1)] hover:text-[rgb(var(--color-danger-fg))] disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  <Link
                    href="/admin/bar/vendas?status=PENDENTE"
                    className="ml-auto shrink-0 pl-2 text-[11px] font-semibold text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
                  >
                    Ver todas
                  </Link>
                </div>
              )}

              <div className="shrink-0 space-y-2 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
                  <input
                    type="search"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar no cardápio…"
                    aria-label="Buscar no cardápio"
                    className="h-10 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] pl-9 pr-3 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary)_/_0.5)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary)_/_0.2)]"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
                    <button
                      type="button"
                      aria-pressed={categoriaId == null}
                      onClick={() => setCategoriaId(null)}
                      className={[
                        'h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold transition-colors',
                        categoriaId == null
                          ? 'bg-[rgb(var(--primary))] text-[rgb(var(--color-primary-fg))]'
                          : 'border border-[rgb(var(--border))] bg-[rgb(var(--background))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
                      ].join(' ')}
                    >
                      Todos
                    </button>
                    {categorias.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={categoriaId === c.id}
                        onClick={() => setCategoriaId(c.id)}
                        className={[
                          'h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold transition-colors',
                          categoriaId === c.id
                            ? 'bg-[rgb(var(--primary))] text-[rgb(var(--color-primary-fg))]'
                            : 'border border-[rgb(var(--border))] bg-[rgb(var(--background))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
                        ].join(' ')}
                      >
                        {c.nome}
                      </button>
                    ))}
                  </div>
                  <span className="hidden shrink-0 text-[11px] tabular-nums text-[rgb(var(--foreground-muted))] @[48rem]/pdv:block">
                    {filtrados.length} {filtrados.length === 1 ? 'item' : 'itens'}
                  </span>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-24 @[60rem]/pdv:pb-3">
                {filtrados.length === 0 ? (
                  <MotionEmptyState
                    icon={<Beer className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
                    title="Nenhum produto"
                    description={
                      busca.trim()
                        ? 'Nada encontrado com esse nome.'
                        : 'Cadastre itens em Produtos do bar para vender no PDV.'
                    }
                    className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] py-16 text-center"
                  />
                ) : (
                  // Linhas compactas em auto-fill: o operador precisa varrer o
                  // cardápio inteiro de relance. Card alto com foto grande cabia
                  // 3 itens na tela; a linha de 4rem cabe 8 por coluna.
                  // Zona de ação com largura fixa — a linha não reflui ao lançar.
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(15.5rem,100%),1fr))] gap-2">
                    {filtrados.map((p) => {
                      const noCarrinho = cart.find((l) => l.produtoId === p.id)?.quantidade ?? 0
                      const disponivel = estoqueDisponivel(p.id, p.estoque)
                      const esgotado = p.estoque <= 0
                      const semMais = esgotado || disponivel <= 0
                      const estoqueBaixo =
                        !esgotado && p.estoqueMinimo != null && p.estoque <= p.estoqueMinimo
                      const bloqueado = semMais || pending
                      const lancar = () => {
                        if (!bloqueado) setQtdProduto(p, 1)
                      }
                      return (
                        // Div (não button): o −/+ aninha <button> real; button dentro
                        // de button fecha o externo cedo e estilhaça a grade.
                        <m.div
                          key={p.id}
                          role="button"
                          tabIndex={esgotado ? -1 : 0}
                          aria-disabled={bloqueado}
                          aria-label={`${p.nome}, ${formatarPreco(p.preco)}${
                            noCarrinho > 0 ? `, ${noCarrinho} na comanda` : ''
                          }${esgotado ? ', esgotado' : ''}`}
                          whileTap={bloqueado ? undefined : { scale: 0.98 }}
                          transition={springSnappy}
                          onClick={lancar}
                          onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              lancar()
                            }
                          }}
                          className={[
                            'flex min-w-0 select-none items-center gap-2.5 rounded-xl border p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary)_/_0.5)]',
                            esgotado
                              ? 'cursor-not-allowed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] opacity-55'
                              : noCarrinho > 0
                                ? 'cursor-pointer border-[rgb(var(--color-primary)_/_0.55)] bg-[rgb(var(--color-primary)_/_0.08)]'
                                : 'cursor-pointer border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--color-primary)_/_0.35)] hover:bg-[rgb(var(--surface-raised))]',
                          ].join(' ')}
                        >
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--background-subtle))]">
                            <ProdutoImagem
                              src={p.imagemUrl}
                              alt=""
                              variant="thumb"
                              className="!h-full !w-full !rounded-lg"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-[13px] font-semibold leading-tight text-[rgb(var(--foreground))]"
                              title={p.nome}
                            >
                              {p.nome}
                            </p>
                            <p className="mt-1 flex items-baseline gap-1.5 leading-none">
                              <span className="text-[13px] font-bold tabular-nums text-[rgb(var(--foreground))]">
                                {formatarPreco(p.preco)}
                              </span>
                              <span className="text-[rgb(var(--border-strong))]">·</span>
                              <span
                                className={[
                                  'truncate text-[11px] font-semibold',
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
                              </span>
                            </p>
                          </div>

                          <div
                            className="flex w-[4.25rem] shrink-0 items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            role="presentation"
                          >
                            {esgotado ? null : noCarrinho > 0 ? (
                              <>
                                <button
                                  type="button"
                                  aria-label={`Remover uma unidade de ${p.nome}`}
                                  disabled={pending}
                                  onClick={() => setQtdProduto(p, -1)}
                                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background))] text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-40"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <m.span
                                  key={noCarrinho}
                                  initial={{ scale: 0.7 }}
                                  animate={{ scale: 1 }}
                                  transition={springSnappy}
                                  className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[rgb(var(--primary))] px-1.5 text-xs font-bold tabular-nums text-[rgb(var(--color-primary-fg))]"
                                >
                                  {noCarrinho}
                                </m.span>
                              </>
                            ) : (
                              <button
                                type="button"
                                aria-label={`Adicionar ${p.nome}`}
                                disabled={bloqueado}
                                onClick={lancar}
                                className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background))] text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--color-primary)_/_0.5)] hover:bg-[rgb(var(--primary))] hover:text-[rgb(var(--color-primary-fg))] disabled:opacity-40"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </m.div>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* Comanda: coluna fixa a partir de 60rem de frame. */}
            <aside className="hidden min-h-0 w-[21rem] shrink-0 flex-col border-l border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 @[60rem]/pdv:flex @[76rem]/pdv:w-[23rem] @[100rem]/pdv:w-[25rem]">
              {sidebar}
            </aside>
          </div>
        )}
      </div>

      {/* Frame estreito: barra de resumo + bottom sheet da comanda. */}
      {turnoAberto && !comandaMobileAberta && cart.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 z-30 border-t border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.97)] p-3 backdrop-blur @[60rem]/pdv:hidden">
          <button
            type="button"
            disabled={pending}
            onClick={() => setComandaMobileAberta(true)}
            className="flex w-full items-center justify-between gap-3 rounded-xl bg-[rgb(var(--primary))] px-4 py-3.5 text-sm font-bold text-[rgb(var(--color-primary-fg))] disabled:opacity-50"
          >
            <span className="flex items-center gap-2">
              Ver comanda
              <span className="rounded-full bg-black/15 px-2 py-0.5 text-xs tabular-nums">
                {qtdItens}
              </span>
            </span>
            <span className="tabular-nums">{formatarPreco(resumo.total)}</span>
          </button>
        </div>
      )}

      {turnoAberto && comandaMobileAberta && (
        <div className="absolute inset-0 z-40 flex flex-col justify-end @[60rem]/pdv:hidden">
          <button
            type="button"
            aria-label="Fechar comanda"
            className="absolute inset-0 bg-black/50"
            onClick={() => setComandaMobileAberta(false)}
          />
          <div className="relative flex h-[85%] flex-col rounded-t-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-2xl">
            <div className="relative flex h-10 shrink-0 items-center justify-center border-b border-[rgb(var(--border))] px-3">
              <div className="h-1 w-10 rounded-full bg-[rgb(var(--border-strong))]" />
              <button
                type="button"
                onClick={() => setComandaMobileAberta(false)}
                className="absolute right-1.5 flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                aria-label="Fechar comanda"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 p-3">{sidebar}</div>
          </div>
        </div>
      )}

      {turnoDrawer}
    </div>
  )
}
