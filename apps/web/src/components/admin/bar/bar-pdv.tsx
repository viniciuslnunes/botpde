'use client'

import { useCallback, useMemo, useState, useSyncExternalStore, useTransition } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import { ArrowLeft, Banknote, Beer, Check, CheckCircle2, ChevronDown, Clock, Copy, CreditCard, Eye, LayoutGrid, Loader2, Minus, NotebookPen, PanelLeftClose, PanelLeftOpen, Play, Plus, QrCode, ReceiptText, RotateCcw, Save, Search, Trash2, Unlock, X } from 'lucide-react'
import {
  LIMITE_COMANDA_PADRAO,
  METODO_PAGAMENTO_BAR_LABEL,
  METODO_PAGAMENTO_QUITACAO_FIADO_BAR,
  percentualLimite,
  resumirVenda,
  saldoComanda,
} from '@torcida/types'
import { toast } from '@torcida/ui'
import {
  cancelarVendaBar,
  confirmarPixMockBar,
  consultarStatusVendaBar,
  registrarVendaBar,
} from '@/app/admin/bar/actions'
import {
  abrirComandaBar,
  confirmarPixMockComandaBar,
  consultarStatusComandaBar,
  fecharComandaBar,
  lancarItensComandaBar,
  liberarLimiteComandaBar,
  removerLancamentoComandaBar,
} from '@/app/admin/bar/comanda-actions'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { DatePicker } from '@/components/ui/date-picker'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { MotionSuccessPanel } from '@/components/motion/motion-success-panel'
import { cartItemExit, springSnappy } from '@/lib/motion-presets'
import { useVisibleInterval } from '@/lib/use-visible-interval'
import type {
  BarComandaSerializada,
  BarProdutoSerializado,
  BarVendaSerializada,
} from '@/lib/bar-serialize'
import { AppButton } from '@/components/ui/button'

/** Métodos do Pedido (venda rápida) e do fechamento de comanda — sem FIADO. */
type Metodo = (typeof METODO_PAGAMENTO_QUITACAO_FIADO_BAR)[number]

type PedidoLine = {
  produtoId: string
  nome: string
  preco: number
  quantidade: number
  estoque: number
}

type PixPendente =
  | {
      kind: 'venda'
      vendaId: string
      copiaCola: string
      provider: string
      total: number
    }
  | {
      kind: 'comanda'
      comandaId: string
      pagamentoId: string
      copiaCola: string
      provider: string
      total: number
    }

type Fase = 'venda' | 'pix' | 'sucesso'

type PagamentoLinha = { metodo: Metodo; valorStr: string }

/** Resumo do turno exibido no topbar quando a trilha lateral não cabe. */
export type BarPdvTurnoResumo = {
  totalPago: number
  quantidadePaga: number
  dinheiroEsperado: number
  pendentes: number
}

/** Rótulo curto do método: no rodapé do Pedido (21rem) "Cartão de crédito" quebra. */
const METODO_LABEL_CURTO: Record<string, string> = {
  PIX: 'PIX',
  DINHEIRO: 'Dinheiro',
  CARTAO_DEBITO: 'Débito',
  CARTAO_CREDITO: 'Crédito',
}

const METODOS_PEDIDO = METODO_PAGAMENTO_QUITACAO_FIADO_BAR as readonly Metodo[]

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

/** Data padrão de vencimento do débito: hoje + 7 dias, em `yyyy-mm-dd`. */
function vencimentoDebitoPadrao(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

function recomputarComandaLocal(c: BarComandaSerializada): BarComandaSerializada {
  const total = c.lancamentos.reduce((acc, l) => acc + l.total, 0)
  const saldo = saldoComanda({ total, desconto: c.desconto, totalPago: c.totalPago })
  const pct = percentualLimite(total, c.limiteEfetivo)
  return { ...c, total, saldo, percentualLimite: pct }
}

export function BarPdv({
  produtos: produtosIniciais,
  categorias,
  pendentes: pendentesIniciais,
  pendentesTotal: pendentesTotalInicial,
  unidadeNome,
  podeCancelar,
  podeGerir = podeCancelar,
  membrosComanda = [],
  comandasAbertas: comandasIniciais = [],
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
  /** Liberar limite, desconto, débito e remover lançamento exigem `bar:manage`. */
  podeGerir?: boolean
  /** Membros aprovados da unidade — titular MEMBRO ao abrir comanda. */
  membrosComanda?: { id: string; nome: string }[]
  /** Comandas ABERTA da unidade (contexto do PDV). */
  comandasAbertas?: BarComandaSerializada[]
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
  const [comandas, setComandas] = useState(comandasIniciais)
  const [comandasPropRef, setComandasPropRef] = useState(comandasIniciais)
  const [comandaIdAtiva, setComandaIdAtiva] = useState<string | null>(null)
  /** Preferência visual do painel (Venda rápida | Comanda), independente de haver comanda selecionada. */
  const [painelModo, setPainelModo] = useState<'venda' | 'comanda'>('venda')

  // Sync após router.refresh (nova referência de props) sem useEffect.
  if (comandasIniciais !== comandasPropRef) {
    setComandasPropRef(comandasIniciais)
    setComandas(comandasIniciais)
    if (comandaIdAtiva && !comandasIniciais.some((c) => c.id === comandaIdAtiva)) {
      setComandaIdAtiva(null)
      setPainelModo('venda')
    }
  }
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [pedido, setPedido] = useState<PedidoLine[]>([])
  const [metodo, setMetodo] = useState<Metodo>('DINHEIRO')
  const [descontoStr, setDescontoStr] = useState('')
  const [observacao, setObservacao] = useState('')
  const [fase, setFase] = useState<Fase>('venda')
  const [pix, setPix] = useState<PixPendente | null>(null)
  const [pixItens, setPixItens] = useState<PedidoLine[] | null>(null)
  const [ultimoTotal, setUltimoTotal] = useState(0)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [pedidoMobileAberto, setPedidoMobileAberto] = useState(false)
  const [opcoesAbertas, setOpcoesAbertas] = useState(false)
  const turnoSidebarAberto = useSyncExternalStore(
    turnoSidebarSubscribe,
    turnoSidebarSnapshot,
    turnoSidebarServerSnapshot,
  )
  const [turnoDrawerAberto, setTurnoDrawerAberto] = useState(false)

  // Modais de comanda
  const [modalAbrir, setModalAbrir] = useState(false)
  const [abrirCodigo, setAbrirCodigo] = useState('')
  const [abrirTipo, setAbrirTipo] = useState<'MEMBRO' | 'AVULSO'>('AVULSO')
  const [abrirMembroId, setAbrirMembroId] = useState('')
  const [abrirNome, setAbrirNome] = useState('')
  const [abrirLimite, setAbrirLimite] = useState('')
  const [modalFechar, setModalFechar] = useState(false)
  const [fecharDesconto, setFecharDesconto] = useState('')
  const [fecharMotivoDesconto, setFecharMotivoDesconto] = useState('')
  const [fecharPagamentos, setFecharPagamentos] = useState<PagamentoLinha[]>([
    { metodo: 'DINHEIRO', valorStr: '' },
  ])
  const [fecharVencimento, setFecharVencimento] = useState(vencimentoDebitoPadrao)
  const [modalLimite, setModalLimite] = useState(false)
  const [novoLimiteStr, setNovoLimiteStr] = useState('')
  const [removerVendaId, setRemoverVendaId] = useState<string | null>(null)
  const [removerMotivo, setRemoverMotivo] = useState('')

  const comandaAtiva = useMemo(
    () => (comandaIdAtiva ? (comandas.find((c) => c.id === comandaIdAtiva) ?? null) : null),
    [comandaIdAtiva, comandas],
  )
  const modoComanda = comandaAtiva != null

  const desconto = Math.max(0, Number(descontoStr.replace(',', '.')) || 0)

  const resumo = useMemo(
    () =>
      resumirVenda(
        pedido.map((l) => ({ precoUnit: l.preco, quantidade: l.quantidade })),
        modoComanda ? 0 : desconto,
      ),
    [pedido, desconto, modoComanda],
  )

  const qtdItens = useMemo(() => pedido.reduce((n, l) => n + l.quantidade, 0), [pedido])

  const avisoLimitePct = useMemo(() => {
    if (!comandaAtiva?.limiteEfetivo) return null
    const pct = percentualLimite(comandaAtiva.total, comandaAtiva.limiteEfetivo)
    return pct != null && pct >= 80 ? pct : null
  }, [comandaAtiva])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return produtos.filter((p) => {
      if (categoriaId && p.categoria?.id !== categoriaId) return false
      if (q && !p.nome.toLowerCase().includes(q)) return false
      return true
    })
  }, [produtos, categoriaId, busca])

  const contagemPorCategoria = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of produtos) {
      const id = p.categoria?.id
      if (!id) continue
      map.set(id, (map.get(id) ?? 0) + 1)
    }
    return map
  }, [produtos])

  const imagemPorProdutoId = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const p of produtos) map.set(p.id, p.imagemUrl)
    return map
  }, [produtos])

  const estoqueDisponivel = useCallback(
    (produtoId: string, estoqueBase: number) => {
      const noPedido = pedido.find((l) => l.produtoId === produtoId)?.quantidade ?? 0
      return Math.max(0, estoqueBase - noPedido)
    },
    [pedido],
  )

  function adicionarProduto(p: BarProdutoSerializado) {
    if (fase !== 'venda' || p.estoque <= 0) return
    setErro(null)
    setPedido((prev) => {
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
    setPedido((prev) =>
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
    const noPedido = pedido.find((l) => l.produtoId === p.id)
    if (!noPedido && delta > 0) {
      adicionarProduto(p)
      return
    }
    if (noPedido) alterarQtd(p.id, delta)
  }

  function removerLinha(produtoId: string) {
    setPedido((prev) => prev.filter((l) => l.produtoId !== produtoId))
  }

  function limparPedido() {
    setPedido([])
    setDescontoStr('')
    setObservacao('')
    setErro(null)
  }

  function aplicarBaixaLocal(linhas: PedidoLine[]) {
    setProdutos((prev) =>
      prev.map((p) => {
        const linha = linhas.find((l) => l.produtoId === p.id)
        if (!linha) return p
        return { ...p, estoque: Math.max(0, p.estoque - linha.quantidade) }
      }),
    )
  }

  function restaurarBaixaLocal(linhas: PedidoLine[]) {
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
    limparPedido()
    setMetodo('DINHEIRO')
    setPedidoMobileAberto(false)
  }

  function cobrar() {
    if (pedido.length === 0) {
      setErro('Adicione pelo menos um item')
      return
    }
    setErro(null)
    const snapshot = pedido.map((l) => ({ ...l }))
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
      setPedidoMobileAberto(false)

      if (result.pago) {
        setUltimoTotal(totalPrevisto)
        setFase('sucesso')
        setPedido([])
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
        kind: 'venda',
        vendaId: result.vendaId,
        copiaCola: result.pix.copiaCola,
        provider: result.pix.provider,
        total: totalPrevisto,
      })
      setPixItens(snapshot)
      setUltimoTotal(totalPrevisto)
      setFase('pix')
      setPedido([])
      setDescontoStr('')
      setObservacao('')
    })
  }

  function lancarNaComanda() {
    if (!comandaAtiva) return
    if (pedido.length === 0) {
      setErro('Adicione pelo menos um item')
      return
    }
    setErro(null)
    const snapshot = pedido.map((l) => ({ ...l }))
    const totalPedido = resumo.total

    startTransition(async () => {
      const result = await lancarItensComandaBar({
        comandaId: comandaAtiva.id,
        itens: snapshot.map((l) => ({ produtoId: l.produtoId, quantidade: l.quantidade })),
      })
      if (!result.success) {
        setErro(result.error)
        toast.error(result.error)
        return
      }

      aplicarBaixaLocal(snapshot)
      setPedido([])
      setPedidoMobileAberto(false)

      const novoLancamento = {
        id: result.vendaId,
        total: totalPedido,
        criadoEm: new Date().toISOString(),
        itens: snapshot.map((l, i) => ({
          id: `local-${i}`,
          produtoId: l.produtoId,
          produtoNome: l.nome,
          quantidade: l.quantidade,
          precoUnit: l.preco,
          total: l.preco * l.quantidade,
        })),
      }
      setComandas((prev) =>
        prev.map((c) => {
          if (c.id !== comandaAtiva.id) return c
          return recomputarComandaLocal({
            ...c,
            total: result.totalComanda,
            lancamentos: [...c.lancamentos, novoLancamento],
          })
        }),
      )
      if (result.avisoLimitePct != null) {
        toast.message(`Comanda em ${Math.round(result.avisoLimitePct)}% do limite`)
      } else {
        toast.success('Itens lançados na comanda')
      }
      router.refresh()
    })
  }

  function confirmarAbrirComanda() {
    const codigo = abrirCodigo.trim()
    if (!codigo) {
      toast.error('Informe o código da comanda')
      return
    }
    const limiteNum =
      abrirLimite.trim() === '' ? undefined : Number(abrirLimite.replace(',', '.'))
    if (limiteNum != null && (!Number.isFinite(limiteNum) || limiteNum <= 0)) {
      toast.error('Limite inválido')
      return
    }
    startTransition(async () => {
      const result = await abrirComandaBar({
        codigo,
        tipo: abrirTipo,
        membroId: abrirTipo === 'MEMBRO' ? abrirMembroId || undefined : undefined,
        titularNome: abrirTipo === 'AVULSO' ? abrirNome.trim() || undefined : undefined,
        limite: limiteNum,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const titularNome =
        abrirTipo === 'MEMBRO'
          ? (membrosComanda.find((m) => m.id === abrirMembroId)?.nome ?? 'Membro')
          : abrirNome.trim()
      const limiteEfetivo =
        limiteNum ?? LIMITE_COMANDA_PADRAO
      const nova: BarComandaSerializada = {
        id: result.comandaId,
        codigo,
        tipo: abrirTipo,
        status: 'ABERTA',
        titularNome,
        titularMembroId: abrirTipo === 'MEMBRO' ? abrirMembroId : null,
        limite: limiteNum ?? null,
        limiteEfetivo,
        total: 0,
        totalPago: 0,
        desconto: 0,
        saldo: 0,
        percentualLimite: 0,
        abertaEm: new Date().toISOString(),
        lancamentos: [],
      }
      setComandas((prev) => [...prev, nova].sort((a, b) => a.codigo.localeCompare(b.codigo)))
      setComandaIdAtiva(result.comandaId)
      setPainelModo('comanda')
      setModalAbrir(false)
      setAbrirCodigo('')
      setAbrirNome('')
      setAbrirMembroId('')
      setAbrirLimite('')
      toast.success(`Comanda ${codigo} aberta`)
      router.refresh()
    })
  }

  function confirmarLiberarLimite() {
    if (!comandaAtiva || !podeGerir) return
    const novo =
      novoLimiteStr.trim() === '' ? undefined : Number(novoLimiteStr.replace(',', '.'))
    if (novo != null && (!Number.isFinite(novo) || novo <= 0)) {
      toast.error('Limite inválido')
      return
    }
    startTransition(async () => {
      const result = await liberarLimiteComandaBar({
        comandaId: comandaAtiva.id,
        novoLimite: novo,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      setComandas((prev) =>
        prev.map((c) => {
          if (c.id !== comandaAtiva.id) return c
          const limiteEfetivo = novo ?? LIMITE_COMANDA_PADRAO
          return recomputarComandaLocal({
            ...c,
            limite: novo ?? null,
            limiteEfetivo,
          })
        }),
      )
      setModalLimite(false)
      setNovoLimiteStr('')
      toast.success('Limite atualizado')
      router.refresh()
    })
  }

  function confirmarRemoverLancamento() {
    if (!removerVendaId || !podeGerir) return
    if (removerMotivo.trim().length < 3) {
      toast.error('Informe o motivo (mín. 3 caracteres)')
      return
    }
    const vendaId = removerVendaId
    const lancamento = comandaAtiva?.lancamentos.find((l) => l.id === vendaId)
    startTransition(async () => {
      const result = await removerLancamentoComandaBar({
        vendaId,
        motivo: removerMotivo.trim(),
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (lancamento) {
        const linhas: PedidoLine[] = lancamento.itens
          .filter((i) => i.produtoId)
          .map((i) => ({
            produtoId: i.produtoId!,
            nome: i.produtoNome,
            preco: i.precoUnit,
            quantidade: i.quantidade,
            estoque: i.quantidade,
          }))
        if (linhas.length) restaurarBaixaLocal(linhas)
      }
      setComandas((prev) =>
        prev.map((c) => {
          if (c.id !== comandaAtiva?.id) return c
          return recomputarComandaLocal({
            ...c,
            lancamentos: c.lancamentos.filter((l) => l.id !== vendaId),
          })
        }),
      )
      setRemoverVendaId(null)
      setRemoverMotivo('')
      toast.message('Lançamento removido — estoque restaurado')
      router.refresh()
    })
  }

  function abrirModalFechar() {
    if (!comandaAtiva) return
    if (comandaAtiva.lancamentos.length === 0) {
      toast.error('Comanda sem consumo — cancele em vez de fechar')
      return
    }
    const saldo = comandaAtiva.saldo > 0 ? comandaAtiva.saldo : comandaAtiva.total - comandaAtiva.desconto
    setFecharDesconto('')
    setFecharMotivoDesconto('')
    setFecharPagamentos([{ metodo: 'DINHEIRO', valorStr: saldo > 0 ? String(saldo.toFixed(2)) : '' }])
    setFecharVencimento(vencimentoDebitoPadrao())
    setModalFechar(true)
  }

  function confirmarFecharComanda() {
    if (!comandaAtiva) return
    const descontoFechar = Math.max(0, Number(fecharDesconto.replace(',', '.')) || 0)
    const pagamentos = fecharPagamentos
      .map((p) => ({
        metodo: p.metodo,
        valor: Number(p.valorStr.replace(',', '.')) || 0,
      }))
      .filter((p) => p.valor > 0)

    const totalAposDesconto = Math.max(0, comandaAtiva.total - descontoFechar)
    const somaPag = pagamentos.reduce((a, p) => a + p.valor, 0)
    const saldoPrevisto = Math.max(
      0,
      Math.round((totalAposDesconto - comandaAtiva.totalPago - somaPag) * 100) / 100,
    )

    if (saldoPrevisto > 0) {
      if (!podeGerir) {
        toast.error('Fechar com débito exige permissão de gestor')
        return
      }
      if (comandaAtiva.tipo === 'AVULSO') {
        toast.error('Comanda avulsa não pode fechar com débito — cubra o total')
        return
      }
      if (!fecharVencimento) {
        toast.error('Informe o vencimento do débito')
        return
      }
    }
    if (descontoFechar > 0 && !podeGerir) {
      toast.error('Desconto exige permissão de gestor')
      return
    }

    startTransition(async () => {
      const result = await fecharComandaBar({
        comandaId: comandaAtiva.id,
        desconto: descontoFechar,
        motivoDesconto: descontoFechar > 0 ? fecharMotivoDesconto.trim() || undefined : undefined,
        pagamentos,
        vencimento: saldoPrevisto > 0 ? fecharVencimento : undefined,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }

      setModalFechar(false)

      if (result.pix && result.pix.length > 0) {
        const first = result.pix[0]!
        setPix({
          kind: 'comanda',
          comandaId: comandaAtiva.id,
          pagamentoId: first.pagamentoId,
          copiaCola: first.copiaCola,
          provider: first.provider,
          total: totalAposDesconto - comandaAtiva.totalPago,
        })
        setUltimoTotal(totalAposDesconto - comandaAtiva.totalPago)
        setFase('pix')
        toast.message('Aguardando PIX da comanda')
        return
      }

      setComandas((prev) => prev.filter((c) => c.id !== comandaAtiva.id))
      setComandaIdAtiva(null)
      setPainelModo('venda')
      setUltimoTotal(totalAposDesconto)
      setFase('sucesso')
      toast.success(
        result.status === 'FECHADA_COM_DEBITO' ? 'Comanda fechada com débito' : 'Comanda fechada',
      )
      router.refresh()
    })
  }

  function retomarPendente(venda: BarVendaSerializada) {
    if (!venda.pixCopiaCola) {
      toast.error('PIX desta venda não está disponível')
      return
    }
    setPix({
      kind: 'venda',
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
    setPedidoMobileAberto(false)
  }

  function cancelarPendenteDaFaixa(venda: BarVendaSerializada) {
    if (!podeCancelar) return
    startTransition(async () => {
      const result = await cancelarVendaBar(venda.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      const linhas: PedidoLine[] = venda.itens
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
      if (pix?.kind === 'venda' && pix.vendaId === venda.id) {
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
      if (pix.kind === 'venda') {
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
        return
      }

      const status = await consultarStatusComandaBar(pix.comandaId)
      if (!status.success) return
      if (status.status === 'FECHADA_PAGA' || status.status === 'FECHADA_COM_DEBITO') {
        setComandas((prev) => prev.filter((c) => c.id !== pix.comandaId))
        setComandaIdAtiva(null)
        setPainelModo('venda')
        setFase('sucesso')
        setPix(null)
        toast.success('PIX da comanda confirmado', { description: formatarPreco(pix.total) })
        router.refresh()
      }
    })()
  }, [pix, pixItens, router])

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
      if (pix.kind === 'venda') {
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
        return
      }
      const result = await confirmarPixMockComandaBar(pix.pagamentoId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setComandas((prev) => prev.filter((c) => c.id !== pix.comandaId))
      setComandaIdAtiva(null)
      setPainelModo('venda')
      setFase('sucesso')
      setPix(null)
      toast.success('PIX da comanda confirmado (mock)')
      router.refresh()
    })
  }

  function cancelarPix() {
    if (!pix || pix.kind !== 'venda' || !podeCancelar) return
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

  // @container: o Pedido é renderizado tanto na coluna fixa (21–25rem) quanto no
  // bottom sheet das telas estreitas. Breakpoint de viewport aqui mentia —
  // `sm:grid-cols-2` valia numa coluna de 21rem e espremia os campos.
  const sidebar = (
    <div className="@container flex h-full min-h-0 flex-col">
      {/* Cabeçalho: contexto + toggle Venda rápida | Comanda */}
      <div className="shrink-0 space-y-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
              {painelModo === 'comanda' ? 'Comanda' : 'Pedido'}
            </p>
            <h2 className="truncate text-base font-bold leading-tight text-[rgb(var(--foreground))]">
              {painelModo === 'comanda' && comandaAtiva
                ? `${comandaAtiva.codigo} · ${comandaAtiva.titularNome}`
                : painelModo === 'comanda'
                  ? 'Selecione ou abra'
                  : unidadeNome}
            </h2>
          </div>
          {pedido.length > 0 && (
            <AppButton
              variant="none"
              icon={RotateCcw}
              type="button"
              onClick={limparPedido}
              className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-[rgb(var(--color-danger-fg))] transition-colors hover:bg-[rgb(var(--color-danger)_/_0.1)]"
            >
              Limpar
            </AppButton>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Modo do pedido"
          className="grid grid-cols-2 gap-1 rounded-2xl bg-[rgb(var(--background-subtle))] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={painelModo === 'venda'}
            onClick={() => {
              setPainelModo('venda')
              setComandaIdAtiva(null)
              setErro(null)
            }}
            className={[
              'rounded-xl px-3 py-2 text-xs font-bold transition-colors',
              painelModo === 'venda'
                ? 'bg-[rgb(var(--color-primary)_/_0.16)] text-[rgb(var(--color-primary-fg))] shadow-sm'
                : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            Venda rápida
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={painelModo === 'comanda'}
            onClick={() => {
              setPainelModo('comanda')
              if (!comandaIdAtiva && comandas[0]) setComandaIdAtiva(comandas[0].id)
              setErro(null)
            }}
            className={[
              'rounded-xl px-3 py-2 text-xs font-bold transition-colors',
              painelModo === 'comanda'
                ? 'bg-[rgb(var(--color-primary)_/_0.16)] text-[rgb(var(--color-primary-fg))] shadow-sm'
                : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
            ].join(' ')}
          >
            Comanda
          </button>
        </div>

        {painelModo === 'comanda' && (
          <div className="flex items-center gap-1.5">
            <label className="sr-only" htmlFor="pdv-comanda-select-sidebar">
              Comanda ativa
            </label>
            <div className="relative min-w-0 flex-1">
              <NotebookPen className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
              <select
                id="pdv-comanda-select-sidebar"
                value={comandaIdAtiva ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setComandaIdAtiva(v === '' ? null : v)
                  setErro(null)
                }}
                className="h-10 w-full truncate rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] py-0 pl-8 pr-7 text-xs font-semibold text-[rgb(var(--foreground))]"
              >
                <option value="">Escolher comanda…</option>
                {comandas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} · {c.titularNome}
                    {c.total > 0 ? ` · ${formatarPreco(c.total)}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <AppButton
              variant="none"
              icon={Plus}
              type="button"
              disabled={!turnoAberto || pending}
              onClick={() => setModalAbrir(true)}
              className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-[rgb(var(--border))] px-2.5 text-xs font-bold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
            >
              Abrir
            </AppButton>
          </div>
        )}
      </div>

      {modoComanda && comandaAtiva && (
        <div className="mb-2 shrink-0 space-y-1.5 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-2.5 py-2">
          {comandaAtiva.limiteEfetivo != null && (
            <div>
              <div className="mb-1 flex justify-between text-[10px] font-semibold text-[rgb(var(--foreground-muted))]">
                <span>
                  Limite {formatarPreco(comandaAtiva.limiteEfetivo)}
                  {avisoLimitePct != null && (
                    <span className="ml-1 text-[rgb(var(--color-warning-fg))]">
                      · {Math.round(avisoLimitePct)}%
                    </span>
                  )}
                </span>
                {podeGerir && (
                  <AppButton
                    variant="none"
                    icon={Unlock}
                    type="button"
                    onClick={() => {
                      setNovoLimiteStr(
                        comandaAtiva.limite != null ? String(comandaAtiva.limite) : '',
                      )
                      setModalLimite(true)
                    }}
                    className="text-[rgb(var(--color-primary-fg))] hover:underline"
                  >
                    Liberar
                  </AppButton>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[rgb(var(--border))]">
                <div
                  className={[
                    'h-full rounded-full transition-[width]',
                    avisoLimitePct != null
                      ? 'bg-[rgb(var(--color-warning-fg))]'
                      : 'bg-[rgb(var(--primary))]',
                  ].join(' ')}
                  style={{
                    width: `${Math.min(100, comandaAtiva.percentualLimite ?? 0)}%`,
                  }}
                />
              </div>
            </div>
          )}
          <div className="flex justify-between text-[11px] text-[rgb(var(--foreground-muted))]">
            <span>Consumo</span>
            <span className="font-bold tabular-nums text-[rgb(var(--foreground))]">
              {formatarPreco(comandaAtiva.total)}
            </span>
          </div>
          {comandaAtiva.totalPago > 0 && (
            <p className="text-[10px] text-[rgb(var(--foreground-muted))]">
              Já pago {formatarPreco(comandaAtiva.totalPago)} · saldo{' '}
              {formatarPreco(comandaAtiva.saldo)}
            </p>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {pedido.length === 0 ? (
          <div className="flex min-h-[7rem] flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] px-4 py-6 text-center">
            <Beer className="mb-2 h-7 w-7 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Pedido vazio</p>
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
              Toque num item do cardápio para adicionar
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {pedido.map((l) => (
                <m.li
                  key={l.produtoId}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit="exit"
                  variants={cartItemExit}
                  transition={springSnappy}
                  className="flex items-center gap-2.5 rounded-2xl bg-[rgb(var(--background-subtle))] px-2.5 py-2"
                >
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[rgb(var(--background))]">
                    <ProdutoImagem
                      src={imagemPorProdutoId.get(l.produtoId)}
                      alt=""
                      variant="thumb"
                      className="!h-full !w-full !rounded-xl"
                    />
                  </div>
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

        {modoComanda && comandaAtiva && comandaAtiva.lancamentos.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-[rgb(var(--border))] pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Na comanda
            </p>
            {comandaAtiva.lancamentos.map((lanc) => (
              <div
                key={lanc.id}
                className="rounded-2xl bg-[rgb(var(--background-subtle))] px-2.5 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {lanc.itens.map((item) => (
                      <p
                        key={item.id}
                        className="truncate text-[12px] text-[rgb(var(--foreground))]"
                      >
                        {item.quantidade}× {item.produtoNome}
                      </p>
                    ))}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-xs font-bold tabular-nums text-[rgb(var(--foreground))]">
                      {formatarPreco(lanc.total)}
                    </span>
                    {podeGerir && (
                      <button
                        type="button"
                        aria-label="Remover lançamento"
                        onClick={() => {
                          setRemoverVendaId(lanc.id)
                          setRemoverMotivo('')
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--color-danger)_/_0.1)] hover:text-[rgb(var(--color-danger-fg))]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {modoComanda && comandaAtiva && comandaAtiva.lancamentos.length === 0 && pedido.length === 0 && (
          <p className="mt-3 text-center text-xs text-[rgb(var(--foreground-muted))]">
            Nenhum lançamento nesta comanda ainda
          </p>
        )}
      </div>

      <div className="mt-2.5 shrink-0 space-y-2.5 border-t border-[rgb(var(--border))] pt-2.5">
        {painelModo === 'venda' && (
          <>
            {/* lint-botoes: nao-e-acao — disclosure da secao de desconto; o
                rotulo e o titulo do bloco e o chevron ja diz o que o clique
                faz. */}
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
              <div className="grid grid-cols-4 gap-1.5">
                {METODOS_PEDIDO.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={metodo === m}
                    title={METODO_PAGAMENTO_BAR_LABEL[m]}
                    onClick={() => setMetodo(m)}
                    className={[
                      'flex min-h-[4.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-2 text-[10px] font-semibold leading-tight transition-colors',
                      metodo === m
                        ? 'bg-[rgb(var(--color-primary)_/_0.16)] text-[rgb(var(--color-primary-fg))] ring-1 ring-[rgb(var(--color-primary)_/_0.35)]'
                        : 'border border-[rgb(var(--border))] bg-[rgb(var(--background))] text-[rgb(var(--foreground))] hover:border-[rgb(var(--color-primary)_/_0.4)] hover:bg-[rgb(var(--background-subtle))]',
                    ].join(' ')}
                  >
                    <MetodoIcon metodo={m} />
                    {METODO_LABEL_CURTO[m] ?? METODO_PAGAMENTO_BAR_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="space-y-1 px-0.5">
          <div className="flex justify-between text-xs text-[rgb(var(--foreground-muted))]">
            <span>{painelModo === 'comanda' ? 'Pedido' : 'Subtotal'}</span>
            <span className="tabular-nums">{formatarPreco(resumo.subtotal)}</span>
          </div>
          {painelModo === 'venda' && resumo.desconto > 0 && (
            <div className="flex justify-between text-xs text-[rgb(var(--foreground-muted))]">
              <span>Desconto</span>
              <span className="tabular-nums">−{formatarPreco(resumo.desconto)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-2 pt-1">
            <span className="text-sm font-bold text-[rgb(var(--foreground))]">
              {painelModo === 'comanda' ? 'A lançar' : 'Valor total'}
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

        {painelModo === 'comanda' ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled={pending || pedido.length === 0 || !comandaAtiva}
              onClick={lancarNaComanda}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[rgb(var(--primary))] px-4 py-3.5 text-base font-bold text-[rgb(var(--color-primary-fg))] shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[rgb(var(--background-subtle))] disabled:text-[rgb(var(--foreground-muted))] disabled:opacity-100 disabled:shadow-none"
            >
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {!comandaAtiva ? 'Escolha uma comanda' : 'Lançar na comanda'}
              {pedido.length > 0 && comandaAtiva && (
                <span className="tabular-nums opacity-90">· {formatarPreco(resumo.total)}</span>
              )}
            </button>
            <AppButton
              variant="none"
              icon={X}
              type="button"
              disabled={pending || !comandaAtiva || comandaAtiva.lancamentos.length === 0}
              onClick={abrirModalFechar}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[rgb(var(--border))] px-4 py-3 text-sm font-bold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Fechar comanda
              {comandaAtiva && comandaAtiva.total > 0 && (
                <span className="tabular-nums opacity-80">
                  · {formatarPreco(comandaAtiva.total)}
                </span>
              )}
            </AppButton>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending || pedido.length === 0}
            onClick={cobrar}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[rgb(var(--primary))] px-4 py-3.5 text-base font-bold text-[rgb(var(--color-primary-fg))] shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[rgb(var(--background-subtle))] disabled:text-[rgb(var(--foreground-muted))] disabled:opacity-100 disabled:shadow-none"
          >
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {metodo === 'PIX' ? 'Gerar PIX' : 'Finalizar pedido'}
            {pedido.length > 0 && (
              <span className="tabular-nums opacity-90">· {formatarPreco(resumo.total)}</span>
            )}
          </button>
        )}
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
  // disso o Pedido tem prioridade e o turno vira drawer pelo chip do topbar.
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
          // lint-botoes: nao-e-acao — trilho vertical colapsado da sidebar; o
          // texto e escrito em writing-mode vertical e serve de etiqueta da
          // faixa, nao de rotulo de botao.
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
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-success" />
          }
          title="Pago"
          description={formatarPreco(ultimoTotal)}
          className="w-full max-w-md rounded-3xl border border-[rgb(var(--color-success)_/_0.35)] bg-[rgb(var(--color-success)_/_0.08)] p-8 text-center"
        >
          <AppButton
            variant="primary"
            icon={Plus}
            type="button"
            autoFocus
            onClick={novaVenda}
            className="mt-6 rounded-xl px-6 py-3 text-sm font-bold text-[rgb(var(--color-primary-fg))]"
          >
            Nova venda
          </AppButton>
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
          <AppButton
            variant="none"
            icon={ArrowLeft}
            type="button"
            onClick={() => {
              setFase('venda')
              setPix(null)
              setPixItens(null)
            }}
            className="rounded-full border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            Voltar ao PDV
          </AppButton>
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
              <AppButton
                variant="primary"
                icon={CheckCircle2}
                loading={pending}
                type="button"
                disabled={pending}
                onClick={confirmarMock}
                className="flex w-full gap-2 rounded-xl px-4 py-3 text-sm font-bold text-[rgb(var(--color-primary-fg))]"
              >
                Já paguei (mock)
              </AppButton>
            )}

            {podeCancelar && pix.kind === 'venda' && (
              <AppButton
                variant="none"
                icon={X}
                type="button"
                disabled={pending}
                onClick={cancelarPix}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-[rgb(var(--color-danger-fg))] transition-colors hover:bg-[rgb(var(--color-danger)_/_0.08)] disabled:opacity-60"
              >
                Cancelar venda
              </AppButton>
            )}
            {pix.kind === 'comanda' && (
              <AppButton
                variant="none"
                icon={ArrowLeft}
                type="button"
                onClick={() => {
                  setFase('venda')
                  setPix(null)
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))]"
              >
                Voltar sem confirmar
              </AppButton>
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
    <div className="@container/pdv relative flex h-full min-h-0 flex-col overflow-hidden bg-[rgb(var(--background-subtle))]">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="portal-kicker text-[rgb(var(--foreground-muted))]">
            PDV Bar
          </p>
          <h1 className="portal-display truncate text-sm text-[rgb(var(--foreground))] @[48rem]/pdv:text-base">
            {unidadeNome}
          </h1>
        </div>

        {comandaAtiva && avisoLimitePct != null && (
          <span
            title={`${Math.round(avisoLimitePct)}% do limite`}
            className="hidden h-10 items-center rounded-full bg-[rgb(var(--color-warning)_/_0.16)] px-3 text-xs font-bold text-[rgb(var(--color-warning-fg))] @[56rem]/pdv:inline-flex"
          >
            Limite {Math.round(avisoLimitePct)}%
          </span>
        )}

        {/* Números do caixa no topbar: a trilha de turno some abaixo de 82rem. */}
        {turnoResumo && (
          <div className="hidden items-center gap-4 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-1.5 @[72rem]/pdv:flex @[82rem]/pdv:hidden">
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

        <AppButton
          variant="none"
          icon={Clock}
          type="button"
          onClick={() => setTurnoDrawerAberto(true)}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-[rgb(var(--border))] px-3 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] @[82rem]/pdv:hidden"
        >
          {turnoStatusDot}
          <span className="hidden @[48rem]/pdv:inline">Turno</span>
        </AppButton>

        {pendentesTotal > 0 ? (
          <span
            title={`${pendentesTotal} PIX aguardando confirmação`}
            className="hidden h-10 items-center rounded-full bg-[rgb(var(--color-warning)_/_0.16)] px-3 text-xs font-bold text-[rgb(var(--color-warning-fg))] @[56rem]/pdv:inline-flex"
          >
            {pendentesTotal} PIX
          </span>
        ) : null}

        <Link
          href="/admin/bar/vendas"
          className="hidden h-10 items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] @[56rem]/pdv:inline-flex"
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
          // min-w-0: sem isso o `min-width: auto` do item flex deixa a coluna
          // do cardápio mais larga que a viewport e o PDV — que é
          // `overflow-hidden` por ser imersivo — corta a lista no celular.
          <div className="flex min-h-0 min-w-0 flex-1 gap-3 p-3">
            {/* Cardápio */}
            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm">
              <div className="shrink-0 space-y-3 px-4 py-3.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
                  <input
                    type="search"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Pesquisar produto aqui…"
                    aria-label="Pesquisar produto"
                    className="h-11 w-full rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] pl-10 pr-3 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary)_/_0.5)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary)_/_0.2)]"
                  />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-0.5">
                  <button
                    type="button"
                    aria-pressed={categoriaId == null}
                    onClick={() => setCategoriaId(null)}
                    className={[
                      'flex h-[4.75rem] w-[5.5rem] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-center transition-colors',
                      categoriaId == null
                        ? 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))] ring-1 ring-[rgb(var(--color-primary)_/_0.3)]'
                        : 'border border-[rgb(var(--border))] bg-[rgb(var(--background))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
                    ].join(' ')}
                  >
                    <LayoutGrid className="h-5 w-5" />
                    <span className="text-[11px] font-bold leading-tight">Todos</span>
                    <span className="text-[10px] tabular-nums text-[rgb(var(--foreground-muted))]">
                      {produtos.length} {produtos.length === 1 ? 'item' : 'itens'}
                    </span>
                  </button>
                  {categorias.map((c) => {
                    const qtd = contagemPorCategoria.get(c.id) ?? 0
                    const ativa = categoriaId === c.id
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={ativa}
                        onClick={() => setCategoriaId(c.id)}
                        className={[
                          'flex h-[4.75rem] w-[5.5rem] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-center transition-colors',
                          ativa
                            ? 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))] ring-1 ring-[rgb(var(--color-primary)_/_0.3)]'
                            : 'border border-[rgb(var(--border))] bg-[rgb(var(--background))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold',
                            ativa
                              ? 'bg-[rgb(var(--color-primary)_/_0.22)]'
                              : 'bg-[rgb(var(--background-subtle))]',
                          ].join(' ')}
                        >
                          {c.nome.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="line-clamp-1 w-full text-[11px] font-bold leading-tight" title={c.nome}>
                          {c.nome}
                        </span>
                        <span className="text-[10px] tabular-nums text-[rgb(var(--foreground-muted))]">
                          {qtd} {qtd === 1 ? 'item' : 'itens'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 @[60rem]/pdv:pb-20">
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
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(10.5rem,100%),1fr))] gap-3">
                    {filtrados.map((p) => {
                      const noPedido = pedido.find((l) => l.produtoId === p.id)?.quantidade ?? 0
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
                        <m.div
                          key={p.id}
                          role="button"
                          tabIndex={esgotado ? -1 : 0}
                          aria-disabled={bloqueado}
                          aria-label={`${p.nome}, ${formatarPreco(p.preco)}${
                            noPedido > 0 ? `, ${noPedido} no pedido` : ''
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
                            'flex min-w-0 select-none flex-col overflow-hidden rounded-2xl border bg-[rgb(var(--background))] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary)_/_0.5)]',
                            esgotado
                              ? 'cursor-not-allowed border-[rgb(var(--border))] opacity-55'
                              : noPedido > 0
                                ? 'cursor-pointer border-[rgb(var(--color-primary)_/_0.55)] shadow-sm'
                                : 'cursor-pointer border-[rgb(var(--border))] hover:border-[rgb(var(--color-primary)_/_0.35)] hover:shadow-sm',
                          ].join(' ')}
                        >
                          <div className="relative aspect-[4/3] w-full overflow-hidden bg-[rgb(var(--background-subtle))]">
                            <ProdutoImagem
                              src={p.imagemUrl}
                              alt=""
                              variant="card"
                              className="!h-full !w-full"
                            />
                            {estoqueBaixo && !esgotado && (
                              <span className="absolute left-2 top-2 rounded-full bg-[rgb(var(--color-warning)_/_0.92)] px-2 py-0.5 text-[10px] font-bold text-[rgb(var(--color-warning-fg))]">
                                Estoque baixo
                              </span>
                            )}
                            {esgotado && (
                              <span className="absolute left-2 top-2 rounded-full bg-[rgb(var(--color-danger)_/_0.92)] px-2 py-0.5 text-[10px] font-bold text-white">
                                Esgotado
                              </span>
                            )}
                          </div>

                          <div className="flex flex-1 flex-col gap-2 p-2.5">
                            <p
                              className="line-clamp-2 min-h-[2.25rem] text-[13px] font-semibold leading-tight text-[rgb(var(--foreground))]"
                              title={p.nome}
                            >
                              {p.nome}
                            </p>
                            <div className="flex items-baseline justify-between gap-1">
                              <span className="text-sm font-bold tabular-nums text-[rgb(var(--color-primary-fg))]">
                                {formatarPreco(p.preco)}
                              </span>
                              <span
                                className={[
                                  'text-[10px] font-semibold tabular-nums',
                                  esgotado
                                    ? 'text-[rgb(var(--color-danger-fg))]'
                                    : estoqueBaixo
                                      ? 'text-[rgb(var(--color-warning-fg))]'
                                      : 'text-[rgb(var(--foreground-muted))]',
                                ].join(' ')}
                              >
                                {esgotado ? '0 un.' : `${p.estoque} un.`}
                              </span>
                            </div>

                            <div
                              className="mt-auto"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                              role="presentation"
                            >
                              {esgotado ? (
                                <div className="flex h-9 items-center justify-center rounded-xl bg-[rgb(var(--background-subtle))] text-[11px] font-semibold text-[rgb(var(--foreground-muted))]">
                                  Indisponível
                                </div>
                              ) : noPedido > 0 ? (
                                <div className="flex items-center justify-between gap-1 rounded-xl bg-[rgb(var(--color-primary)_/_0.12)] px-1 py-0.5">
                                  <button
                                    type="button"
                                    aria-label={`Remover uma unidade de ${p.nome}`}
                                    disabled={pending}
                                    onClick={() => setQtdProduto(p, -1)}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background))] disabled:opacity-40"
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                  <m.span
                                    key={noPedido}
                                    initial={{ scale: 0.7 }}
                                    animate={{ scale: 1 }}
                                    transition={springSnappy}
                                    className="min-w-6 text-center text-sm font-bold tabular-nums text-[rgb(var(--color-primary-fg))]"
                                  >
                                    {noPedido}
                                  </m.span>
                                  <button
                                    type="button"
                                    aria-label={`Adicionar uma unidade de ${p.nome}`}
                                    disabled={bloqueado}
                                    onClick={lancar}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background))] disabled:opacity-40"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <AppButton
                                  variant="none"
                                  icon={Plus}
                                  type="button"
                                  disabled={bloqueado}
                                  onClick={lancar}
                                  className="flex h-9 w-full items-center justify-center rounded-xl bg-[rgb(var(--background-subtle))] text-[11px] font-bold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--color-primary)_/_0.14)] hover:text-[rgb(var(--color-primary-fg))] disabled:opacity-40"
                                >
                                  Adicionar
                                </AppButton>
                              )}
                            </div>
                          </div>
                        </m.div>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* Pedido: coluna fixa a partir de 60rem de frame. */}
            <aside className="hidden min-h-0 w-[22rem] shrink-0 flex-col overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3.5 shadow-sm @[60rem]/pdv:flex @[76rem]/pdv:w-[24rem] @[100rem]/pdv:w-[26rem]">
              {sidebar}
            </aside>
          </div>
        )}
      </div>

      {/* Barra inferior: comandas abertas + PIX pendentes (estilo mesas da ref). */}
      {turnoAberto && (comandas.length > 0 || pendentes.length > 0) && (
        <div
          className={[
            'pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3',
            pedido.length > 0
              ? 'bottom-[4.75rem] @[60rem]/pdv:bottom-4'
              : 'bottom-3 @[60rem]/pdv:bottom-4',
          ].join(' ')}
        >
          <div className="pointer-events-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.96)] px-2 py-1.5 shadow-lg backdrop-blur">
            {comandas.map((c) => {
              const ativa = c.id === comandaIdAtiva
              const qtdLanc = c.lancamentos.reduce((n, l) => n + l.itens.length, 0)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setPainelModo('comanda')
                    setComandaIdAtiva(c.id)
                    setErro(null)
                  }}
                  className={[
                    'flex h-11 shrink-0 items-center gap-2 rounded-full px-2.5 transition-colors',
                    ativa
                      ? 'bg-[rgb(var(--color-primary)_/_0.16)] text-[rgb(var(--color-primary-fg))]'
                      : 'hover:bg-[rgb(var(--background-subtle))]',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold',
                      ativa
                        ? 'bg-[rgb(var(--primary))] text-[rgb(var(--color-primary-fg))]'
                        : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground))]',
                    ].join(' ')}
                  >
                    {c.codigo.slice(0, 3).toUpperCase()}
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block max-w-[7rem] truncate text-xs font-bold text-[rgb(var(--foreground))]">
                      {c.titularNome}
                    </span>
                    <span className="block text-[10px] tabular-nums text-[rgb(var(--foreground-muted))]">
                      {qtdLanc} {qtdLanc === 1 ? 'item' : 'itens'}
                      {c.total > 0 ? ` · ${formatarPreco(c.total)}` : ''}
                    </span>
                  </span>
                  <span className="rounded-full bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    Aberta
                  </span>
                </button>
              )
            })}
            {pendentes.map((v) => {
              const qtd = v.itens.reduce((n, i) => n + i.quantidade, 0)
              return (
                <div
                  key={v.id}
                  className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-[rgb(var(--color-warning)_/_0.12)] px-2.5"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--color-warning)_/_0.28)] text-[10px] font-bold text-[rgb(var(--color-warning-fg))]">
                    PIX
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block text-xs font-bold tabular-nums text-[rgb(var(--foreground))]">
                      {formatarPreco(v.total)}
                    </span>
                    <span className="block text-[10px] text-[rgb(var(--foreground-muted))]">
                      {qtd} {qtd === 1 ? 'item' : 'itens'} · {formatarTempoRelativo(v.criadoEm)}
                    </span>
                  </span>
                  <AppButton
                    variant="primary"
                    icon={Play}
                    type="button"
                    disabled={pending || !v.pixCopiaCola}
                    onClick={() => retomarPendente(v)}
                    className="h-7 rounded-full px-2.5 text-[11px] font-bold text-[rgb(var(--color-primary-fg))]"
                  >
                    Retomar
                  </AppButton>
                  {podeCancelar && (
                    <button
                      type="button"
                      disabled={pending}
                      aria-label={`Cancelar venda de ${formatarPreco(v.total)}`}
                      onClick={() => cancelarPendenteDaFaixa(v)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--color-danger)_/_0.1)] hover:text-[rgb(var(--color-danger-fg))] disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Frame estreito: barra de resumo + bottom sheet do Pedido. */}
      {turnoAberto && !pedidoMobileAberto && pedido.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 z-30 border-t border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.97)] p-3 backdrop-blur @[60rem]/pdv:hidden">
          <AppButton
            variant="primary"
            icon={Eye}
            type="button"
            disabled={pending}
            onClick={() => setPedidoMobileAberto(true)}
            className="flex w-full justify-between gap-3 rounded-2xl px-4 py-3.5 text-sm font-bold text-[rgb(var(--color-primary-fg))]"
          >
            <span className="flex items-center gap-2">
              Ver pedido
              <span className="rounded-full bg-black/15 px-2 py-0.5 text-xs tabular-nums">
                {qtdItens}
              </span>
            </span>
            <span className="tabular-nums">{formatarPreco(resumo.total)}</span>
          </AppButton>
        </div>
      )}

      {turnoAberto && pedidoMobileAberto && (
        <div className="absolute inset-0 z-40 flex flex-col justify-end @[60rem]/pdv:hidden">
          <button
            type="button"
            aria-label="Fechar pedido"
            className="absolute inset-0 bg-black/50"
            onClick={() => setPedidoMobileAberto(false)}
          />
          <div className="relative flex h-[85%] flex-col rounded-t-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-2xl">
            <div className="relative flex h-10 shrink-0 items-center justify-center border-b border-[rgb(var(--border))] px-3">
              <div className="h-1 w-10 rounded-full bg-[rgb(var(--border-strong))]" />
              <button
                type="button"
                onClick={() => setPedidoMobileAberto(false)}
                className="absolute right-1.5 flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                aria-label="Fechar pedido"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 p-3">{sidebar}</div>
          </div>
        </div>
      )}

      {turnoDrawer}

      {/* Modal: abrir comanda */}
      {modalAbrir && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/50 p-3 @[40rem]/pdv:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdv-abrir-comanda-titulo"
            className="w-full max-w-md rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl @[40rem]/pdv:pb-4"
          >
            <h2
              id="pdv-abrir-comanda-titulo"
              className="text-base font-bold text-[rgb(var(--foreground))]"
            >
              Abrir comanda
            </h2>
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
              Conta aberta para acumular lançamentos. O Pedido continua à direita.
            </p>
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Código *
                <input
                  value={abrirCodigo}
                  onChange={(e) => setAbrirCodigo(e.target.value)}
                  placeholder="Mesa 12 / A-01"
                  className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['AVULSO', 'MEMBRO'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={abrirTipo === t}
                    onClick={() => setAbrirTipo(t)}
                    className={[
                      'rounded-xl px-3 py-2 text-sm font-semibold',
                      abrirTipo === t
                        ? 'bg-[rgb(var(--primary))] text-[rgb(var(--color-primary-fg))]'
                        : 'border border-[rgb(var(--border))]',
                    ].join(' ')}
                  >
                    {t === 'AVULSO' ? 'Avulso' : 'Membro'}
                  </button>
                ))}
              </div>
              {abrirTipo === 'MEMBRO' ? (
                <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                  Titular *
                  <select
                    value={abrirMembroId}
                    onChange={(e) => setAbrirMembroId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
                  >
                    <option value="">Selecione</option>
                    {membrosComanda.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                  Nome *
                  <input
                    value={abrirNome}
                    onChange={(e) => setAbrirNome(e.target.value)}
                    placeholder="Nome / mesa"
                    className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
                  />
                </label>
              )}
              <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Limite (opcional)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={abrirLimite}
                  onChange={(e) => setAbrirLimite(e.target.value)}
                  placeholder={`Padrão R$ ${LIMITE_COMANDA_PADRAO}`}
                  className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm tabular-nums"
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <AppButton
                variant="none"
                icon={X}
                type="button"
                onClick={() => setModalAbrir(false)}
                className="flex-1 rounded-xl border border-[rgb(var(--border))] px-3 py-2.5 text-sm font-semibold"
              >
                Cancelar
              </AppButton>
              <AppButton
                variant="primary"
                icon={Eye}
                loading={pending}
                type="button"
                disabled={pending}
                onClick={confirmarAbrirComanda}
                className="flex flex-1 gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-[rgb(var(--color-primary-fg))]"
              >
                Abrir
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {/* Modal: fechar comanda (N pagamentos) — não usa StickyPersistBar. */}
      {modalFechar && comandaAtiva && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/50 p-3 @[40rem]/pdv:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdv-fechar-comanda-titulo"
            className="max-h-[90%] w-full max-w-lg overflow-y-auto rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl @[40rem]/pdv:pb-4"
          >
            <h2
              id="pdv-fechar-comanda-titulo"
              className="text-base font-bold text-[rgb(var(--foreground))]"
            >
              Fechar comanda {comandaAtiva.codigo}
            </h2>
            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
              Total {formatarPreco(comandaAtiva.total)}
              {comandaAtiva.totalPago > 0 && (
                <> · já pago {formatarPreco(comandaAtiva.totalPago)}</>
              )}
            </p>

            {podeGerir && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                  Desconto (R$)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={fecharDesconto}
                    onChange={(e) => setFecharDesconto(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm tabular-nums"
                  />
                </label>
                <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                  Motivo do desconto
                  <input
                    value={fecharMotivoDesconto}
                    onChange={(e) => setFecharMotivoDesconto(e.target.value)}
                    disabled={!fecharDesconto || Number(fecharDesconto) <= 0}
                    className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm disabled:opacity-50"
                  />
                </label>
              </div>
            )}

            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Pagamentos
                </p>
                <AppButton
                  variant="none"
                  icon={Plus}
                  type="button"
                  onClick={() =>
                    setFecharPagamentos((prev) => [...prev, { metodo: 'DINHEIRO', valorStr: '' }])
                  }
                  className="text-xs font-semibold text-[rgb(var(--color-primary-fg))]"
                >
                  + linha
                </AppButton>
              </div>
              {fecharPagamentos.map((linha, idx) => (
                <div key={idx} className="flex gap-2">
                  <select
                    value={linha.metodo}
                    onChange={(e) => {
                      const metodoNext = e.target.value as Metodo
                      setFecharPagamentos((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, metodo: metodoNext } : p)),
                      )
                    }}
                    className="w-[7.5rem] rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-2 text-sm"
                  >
                    {METODOS_PEDIDO.map((m) => (
                      <option key={m} value={m}>
                        {METODO_LABEL_CURTO[m]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={linha.valorStr}
                    onChange={(e) => {
                      const v = e.target.value
                      setFecharPagamentos((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, valorStr: v } : p)),
                      )
                    }}
                    placeholder="0,00"
                    className="min-w-0 flex-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm tabular-nums"
                  />
                  {fecharPagamentos.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remover linha"
                      onClick={() =>
                        setFecharPagamentos((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-full text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--color-danger)_/_0.1)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {(() => {
              const desc = Math.max(0, Number(fecharDesconto.replace(',', '.')) || 0)
              const soma = fecharPagamentos.reduce(
                (a, p) => a + (Number(p.valorStr.replace(',', '.')) || 0),
                0,
              )
              const saldoPrev = Math.max(
                0,
                Math.round((comandaAtiva.total - desc - comandaAtiva.totalPago - soma) * 100) / 100,
              )
              if (saldoPrev <= 0) return null
              if (comandaAtiva.tipo === 'AVULSO') {
                return (
                  <p role="alert" className="mt-3 text-sm text-[rgb(var(--color-danger-fg))]">
                    Comanda avulsa não fecha com débito — cubra o total.
                  </p>
                )
              }
              if (!podeGerir) {
                return (
                  <p role="alert" className="mt-3 text-sm text-[rgb(var(--color-warning-fg))]">
                    Saldo {formatarPreco(saldoPrev)} — fechar com débito exige gestor.
                  </p>
                )
              }
              return (
                <label className="mt-3 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                  Vencimento do débito *
                  <div className="mt-1">
                    <DatePicker
                      value={fecharVencimento}
                      onChange={setFecharVencimento}
                      aria-label="Vencimento do débito"
                    />
                  </div>
                </label>
              )
            })()}

            <div className="mt-4 flex gap-2">
              <AppButton
                variant="none"
                icon={ArrowLeft}
                type="button"
                onClick={() => setModalFechar(false)}
                className="flex-1 rounded-xl border border-[rgb(var(--border))] px-3 py-2.5 text-sm font-semibold"
              >
                Voltar
              </AppButton>
              <AppButton
                variant="primary"
                icon={Check}
                loading={pending}
                type="button"
                disabled={pending}
                onClick={confirmarFecharComanda}
                className="flex flex-1 gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-[rgb(var(--color-primary-fg))]"
              >
                Confirmar fechamento
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {modalLimite && comandaAtiva && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-2xl"
          >
            <h2 className="text-base font-bold">Liberar / elevar limite</h2>
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
              Comanda {comandaAtiva.codigo} · atual{' '}
              {formatarPreco(comandaAtiva.limiteEfetivo ?? LIMITE_COMANDA_PADRAO)}
            </p>
            <label className="mt-3 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Novo limite (R$)
              <input
                type="number"
                min={0}
                step="0.01"
                value={novoLimiteStr}
                onChange={(e) => setNovoLimiteStr(e.target.value)}
                placeholder={`Padrão ${LIMITE_COMANDA_PADRAO}`}
                className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm tabular-nums"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <AppButton
                variant="none"
                icon={X}
                type="button"
                onClick={() => setModalLimite(false)}
                className="flex-1 rounded-xl border border-[rgb(var(--border))] px-3 py-2.5 text-sm font-semibold"
              >
                Cancelar
              </AppButton>
              <AppButton
                variant="primary"
                icon={Save}
                loading={pending}
                type="button"
                disabled={pending}
                onClick={confirmarLiberarLimite}
                className="flex flex-1 gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-[rgb(var(--color-primary-fg))]"
              >
                Salvar
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {removerVendaId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-2xl"
          >
            <h2 className="text-base font-bold">Remover lançamento</h2>
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
              Devolve estoque e exige motivo (bar:manage).
            </p>
            <label className="mt-3 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Motivo *
              <input
                value={removerMotivo}
                onChange={(e) => setRemoverMotivo(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <AppButton
                variant="none"
                icon={X}
                type="button"
                onClick={() => setRemoverVendaId(null)}
                className="flex-1 rounded-xl border border-[rgb(var(--border))] px-3 py-2.5 text-sm font-semibold"
              >
                Cancelar
              </AppButton>
              <AppButton
                variant="none"
                icon={Trash2}
                loading={pending}
                type="button"
                disabled={pending}
                onClick={confirmarRemoverLancamento}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-danger-fg))] px-3 py-2.5 text-sm font-bold text-white"
              >
                Remover
              </AppButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
