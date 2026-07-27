import { db } from '@torcida/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { ArrowLeft } from 'lucide-react'
import { firstProdutoImagemUrl } from '@/lib/produto-imagem'
import { LojaPedidosList, type PedidoListItem } from '@/components/portal/loja-pedidos-list'
import { formatNomeTorcida } from '@torcida/types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Meus Pedidos' }

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(preco))
}

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(data))
}

const STATUS_COR: Record<string, string> = {
  PENDENTE: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  CONFIRMADO: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  ENTREGUE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  CANCELADO: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: 'Pendente',
  CONFIRMADO: 'Confirmado',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
}

function serializarPedido(pedido: {
  id: string
  status: string
  total: unknown
  modalidadeEntrega: string
  criadoEm: Date
  tenant: { nome: string }
  itens: {
    id: string
    produtoNome: string
    tamanho: string | null
    quantidade: number
    produto: { imagensUrl: unknown }
  }[]
}): PedidoListItem {
  const primeiraImagem = pedido.itens[0]?.produto.imagensUrl
  const titulo =
    pedido.itens.length === 1
      ? pedido.itens[0].produtoNome
      : `Pedido com ${pedido.itens.length} itens`

  return {
    id: pedido.id,
    status: pedido.status,
    statusLabel: STATUS_LABEL[pedido.status] ?? pedido.status,
    statusClass: STATUS_COR[pedido.status] ?? '',
    titulo,
    totalLabel: formatarPreco(pedido.total),
    meta: `${pedido.modalidadeEntrega === 'RETIRADA' ? 'Retirada na sede' : 'Envio'} · ${formatarData(pedido.criadoEm)}`,
    itens: pedido.itens.map((item) => ({
      id: item.id,
      label: `${item.produtoNome}${item.tamanho ? ` · ${item.tamanho}` : ''} × ${item.quantidade}`,
    })),
    imagemUrl: firstProdutoImagemUrl(primeiraImagem as string[] | null | undefined),
    lojaNome: formatNomeTorcida(pedido.tenant.nome),
  }
}

export default async function MeusPedidosPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const pedidos = await db.saasPedido.findMany({
    where: { userId: session.user.id },
    orderBy: { criadoEm: 'desc' },
    include: {
      tenant: { select: { nome: true } },
      itens: { include: { produto: { select: { imagensUrl: true } } } },
    },
  })

  const ativos = pedidos
    .filter((p: (typeof pedidos)[number]) => !['ENTREGUE', 'CANCELADO'].includes(p.status))
    .map(serializarPedido)
  const historico = pedidos
    .filter((p: (typeof pedidos)[number]) => ['ENTREGUE', 'CANCELADO'].includes(p.status))
    .map(serializarPedido)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/portal/loja" className="flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))]">
          <ArrowLeft className="h-4 w-4" /> Loja
        </Link>
        <h1 className="text-xl font-bold">Meus pedidos</h1>
      </div>

      <LojaPedidosList ativos={ativos} historico={historico} />
    </div>
  )
}
