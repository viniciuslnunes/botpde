import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { firstProdutoImagemUrl } from '@/lib/produto-imagem'
import { assertStoreView } from '@/lib/authz'
import { AdminPedidosFiltros, AdminPedidosList } from './admin-pedidos-list'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Pedidos — Loja Admin' }

function formatarPreco(preco: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(preco))
}

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(data))
}

const STATUS_OPTIONS = ['TODOS', 'PENDENTE', 'CONFIRMADO', 'ENTREGUE', 'CANCELADO']

export default async function AdminPedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  try {
    await assertStoreView()
  } catch {
    redirect('/admin')
  }

  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const { status: filtroStatus } = await searchParams
  const statusFiltro = STATUS_OPTIONS.includes(filtroStatus ?? '') && filtroStatus !== 'TODOS' ? filtroStatus : undefined

  const pedidos = await db.saasPedido.findMany({
    where: {
      tenantId: tenant.id,
      ...(statusFiltro ? { status: statusFiltro as 'PENDENTE' | 'CONFIRMADO' | 'CANCELADO' | 'ENTREGUE' } : {}),
    },
    orderBy: { criadoEm: 'desc' },
    include: {
      user: { select: { nome: true, email: true } },
      itens: { include: { produto: { select: { imagensUrl: true } } } },
    },
  })

  const contadores = await db.saasPedido.groupBy({
    by: ['status'],
    where: { tenantId: tenant.id },
    _count: { id: true },
  })

  const contagemPorStatus = Object.fromEntries(contadores.map((c: (typeof contadores)[number]) => [c.status, c._count.id]))
  const total = Object.values(contagemPorStatus).reduce((a, b) => a + b, 0)

  const filtroOptions = STATUS_OPTIONS.map((s) => ({
    value: s,
    label: s === 'TODOS' ? 'Todos' : s.charAt(0) + s.slice(1).toLowerCase(),
    count: s === 'TODOS' ? total : (contagemPorStatus[s] ?? 0),
    href: s === 'TODOS' ? '/admin/loja/pedidos' : `/admin/loja/pedidos?status=${s}`,
    active: (filtroStatus ?? 'TODOS') === s,
  }))

  const pedidosSerializados = pedidos.map((pedido: (typeof pedidos)[number]) => ({
    id: pedido.id,
    clienteNome: pedido.user.nome ?? pedido.user.email ?? '—',
    criadoEmLabel: formatarData(pedido.criadoEm),
    meta: `${pedido.modalidadeEntrega === 'RETIRADA' ? '📍 Retirada na sede' : '📦 Envio'}${pedido.cupomCodigo ? ` · Cupom ${pedido.cupomCodigo}` : ''}`,
    status: pedido.status,
    totalLabel: formatarPreco(pedido.total),
    subtotalRiscado: Number(pedido.desconto) > 0 ? formatarPreco(pedido.subtotal) : null,
    itens: pedido.itens.map((item: (typeof pedido.itens)[number]) => ({
      id: item.id,
      imagemUrl: firstProdutoImagemUrl(item.produto.imagensUrl),
      label: `${item.produtoNome}${item.tamanho ? ` (${item.tamanho})` : ''} × ${item.quantidade}`,
      totalLabel: formatarPreco(item.total),
    })),
  }))

  return (
    <>
      <AdminPedidosFiltros options={filtroOptions} />
      <AdminPedidosList pedidos={pedidosSerializados} />
    </>
  )
}
