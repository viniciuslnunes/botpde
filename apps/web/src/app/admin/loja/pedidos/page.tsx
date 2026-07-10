import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { StatusPedidoBadge, StatusPedidoSelect } from '@/components/admin/produto-forms'
import { ProdutoImagem } from '@/components/portal/produto-imagem'
import { firstProdutoImagemUrl } from '@/lib/produto-imagem'
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
  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const { status: filtroStatus } = await searchParams
  const statusFiltro = STATUS_OPTIONS.includes(filtroStatus ?? '') && filtroStatus !== 'TODOS' ? filtroStatus : undefined

  const pedidos = await db.saasPedido.findMany({
    where: {
      tenantId: tenant.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(statusFiltro ? { status: statusFiltro as any } : {}),
    },
    orderBy: { criadoEm: 'desc' },
    include: {
      user: { select: { nome: true, email: true, avatarUrl: true } },
      produto: { select: { nome: true, imagensUrl: true } },
    },
  })

  const contadores = await db.saasPedido.groupBy({
    by: ['status'],
    where: { tenantId: tenant.id },
    _count: { id: true },
  })

  const contagemPorStatus = Object.fromEntries(
    contadores.map((c: (typeof contadores)[number]) => [c.status, c._count.id])
  )
  const total = Object.values(contagemPorStatus).reduce((a, b) => a + b, 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/loja"
          className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Loja
        </Link>
        <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Pedidos</h1>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => {
          const count = s === 'TODOS' ? total : (contagemPorStatus[s] ?? 0)
          const active = (filtroStatus ?? 'TODOS') === s
          return (
            <Link
              key={s}
              href={s === 'TODOS' ? '/admin/loja/pedidos' : `/admin/loja/pedidos?status=${s}`}
              className={[
                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]'
                  : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
              ].join(' ')}
            >
              {s === 'TODOS' ? 'Todos' : s.charAt(0) + s.slice(1).toLowerCase()}
              <span className="rounded-full bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-xs">{count}</span>
            </Link>
          )
        })}
      </div>

      {/* Lista de pedidos */}
      {pedidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center">
          <Package className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />
          <h3 className="font-semibold text-[rgb(var(--foreground))]">Nenhum pedido encontrado</h3>
          <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
            {statusFiltro ? 'Tente outro filtro.' : 'Os pedidos aparecerão aqui quando os membros comprarem na loja.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Produto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Qtd / Tam</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Data</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {pedidos.map((pedido: (typeof pedidos)[number]) => (
                <tr key={pedido.id} className="hover:bg-[rgb(var(--background-subtle))]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ProdutoImagem
                        src={firstProdutoImagemUrl(pedido.produto.imagensUrl)}
                        alt=""
                        variant="mini"
                      />
                      <span className="font-medium text-[rgb(var(--foreground))]">{pedido.produtoNome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[rgb(var(--foreground-muted))]">
                    {pedido.user.nome ?? pedido.user.email ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-[rgb(var(--foreground-muted))]">
                    {pedido.quantidade}× {pedido.tamanho ? `(${pedido.tamanho})` : ''}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[rgb(var(--foreground))]">
                    {formatarPreco(pedido.total)}
                  </td>
                  <td className="px-4 py-3 text-[rgb(var(--foreground-muted))]">
                    {formatarData(pedido.criadoEm)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusPedidoBadge status={pedido.status} />
                      <StatusPedidoSelect id={pedido.id} statusAtual={pedido.status} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
