import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusPedidoBadge, StatusPedidoSelect } from '@/components/admin/produto-forms'
import { firstProdutoImagemUrl } from '@/lib/produto-imagem'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { assertStoreView } from '@/lib/authz'
import { ArrowLeft, Package } from 'lucide-react'
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/loja" className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))]">
          <ArrowLeft className="h-4 w-4" /> Loja
        </Link>
        <h1 className="text-xl font-bold">Pedidos</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => {
          const count = s === 'TODOS' ? total : (contagemPorStatus[s] ?? 0)
          const active = (filtroStatus ?? 'TODOS') === s
          return (
            <Link
              key={s}
              href={s === 'TODOS' ? '/admin/loja/pedidos' : `/admin/loja/pedidos?status=${s}`}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${active ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]' : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]'}`}
            >
              {s === 'TODOS' ? 'Todos' : s.charAt(0) + s.slice(1).toLowerCase()}
              <span className="rounded-full bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-xs">{count}</span>
            </Link>
          )
        })}
      </div>

      {pedidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16 text-center">
          <Package className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
          <h3 className="font-semibold">Nenhum pedido encontrado</h3>
        </div>
      ) : (
        <div className="space-y-4">
          {pedidos.map((pedido: (typeof pedidos)[number]) => (
            <div key={pedido.id} className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{pedido.user.nome ?? pedido.user.email ?? '—'}</p>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">{formatarData(pedido.criadoEm)}</p>
                  <p className="text-xs mt-1">
                    {pedido.modalidadeEntrega === 'RETIRADA' ? '📍 Retirada na sede' : '📦 Envio'}
                    {pedido.cupomCodigo ? ` · Cupom ${pedido.cupomCodigo}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPedidoBadge status={pedido.status} />
                  <StatusPedidoSelect id={pedido.id} statusAtual={pedido.status} />
                </div>
              </div>
              <ul className="space-y-2 text-sm">
                {pedido.itens.map((item: (typeof pedido.itens)[number]) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <ProdutoImagem src={firstProdutoImagemUrl(item.produto.imagensUrl)} alt="" variant="mini" />
                    <span>{item.produtoNome}{item.tamanho ? ` (${item.tamanho})` : ''} × {item.quantidade}</span>
                    <span className="ml-auto font-medium">{formatarPreco(item.total)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t pt-2 text-sm font-semibold">
                <span>Total</span>
                <span>
                  {Number(pedido.desconto) > 0 && (
                    <span className="mr-2 text-xs font-normal text-emerald-600 line-through">{formatarPreco(pedido.subtotal)}</span>
                  )}
                  {formatarPreco(pedido.total)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
