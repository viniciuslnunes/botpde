import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { db } from '@torcida/db'
import type { StatusVendaBar } from '@torcida/db'
import {
  METODO_PAGAMENTO_BAR_LABEL,
  PERMISSIONS,
  STATUS_VENDA_BAR_LABEL,
} from '@torcida/types'
import { assertAnyPermission, assertPermission } from '@/lib/authz'
import { listarVendasBar, resolveUnidadeBar } from '@/lib/bar'
import { serializeVendaBar } from '@/lib/bar-serialize'
import {
  BarVendasFiltros,
  BarVendasList,
  type BarVendaListItem,
} from '@/components/admin/bar/bar-vendas-list'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Vendas — Bar Admin' }

const STATUS_OPTIONS = ['TODAS', 'PENDENTE', 'PAGA', 'CANCELADA'] as const

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(data),
  )
}

export default async function AdminBarVendasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertAnyPermission([PERMISSIONS.BAR_OPERATE, PERMISSIONS.BAR_MANAGE]))
  } catch {
    redirect('/admin')
  }

  let podeGerir = false
  try {
    await assertPermission(PERMISSIONS.BAR_MANAGE)
    podeGerir = true
  } catch {
    // Operador vê o histórico, mas não cancela vendas.
  }

  const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

  const sp = await searchParams
  const statusFiltro: StatusVendaBar | undefined =
    sp.status === 'PENDENTE' || sp.status === 'PAGA' || sp.status === 'CANCELADA'
      ? sp.status
      : undefined
  const page = Math.max(1, Number(sp.page) || 1)

  const [lista, contadores]: [
    Awaited<ReturnType<typeof listarVendasBar>>,
    { status: StatusVendaBar; _count: { id: number } }[],
  ] = await Promise.all([
    listarVendasBar(tenant.id, unidade.id, { status: statusFiltro, page }),
    db.barVenda.groupBy({
      by: ['status'],
      where: { tenantId: tenant.id, sedeId: unidade.id },
      _count: { id: true },
    }),
  ])

  const contagemPorStatus = Object.fromEntries(contadores.map((c) => [c.status, c._count.id]))
  const totalGeral = contadores.reduce((acc, c) => acc + c._count.id, 0)

  const filtroOptions = STATUS_OPTIONS.map((s) => ({
    value: s,
    label: s === 'TODAS' ? 'Todas' : (STATUS_VENDA_BAR_LABEL[s] ?? s),
    count: s === 'TODAS' ? totalGeral : (contagemPorStatus[s] ?? 0),
    href: s === 'TODAS' ? '/admin/bar/vendas' : `/admin/bar/vendas?status=${s}`,
    active: (statusFiltro ?? 'TODAS') === s,
  }))

  const vendas: BarVendaListItem[] = lista.itens.map(serializeVendaBar).map((v) => ({
    id: v.id,
    criadoEmLabel: formatarData(v.criadoEm),
    operadorNome: v.operador.nome ?? '—',
    metodoLabel: METODO_PAGAMENTO_BAR_LABEL[v.metodoPagamento] ?? v.metodoPagamento,
    status: v.status,
    statusLabel: STATUS_VENDA_BAR_LABEL[v.status] ?? v.status,
    totalLabel: formatarPreco(v.total),
    descontoLabel: v.desconto > 0 ? formatarPreco(v.desconto) : null,
    observacao: v.observacao,
    itens: v.itens.map((item) => ({
      id: item.id,
      label: `${item.produtoNome} × ${item.quantidade}`,
      totalLabel: formatarPreco(item.total),
    })),
  }))

  const totalPaginas = Math.max(1, Math.ceil(lista.total / lista.pageSize))
  const queryStatus = statusFiltro ? `status=${statusFiltro}&` : ''

  return (
    <div className="app-container space-y-6 py-8">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/bar"
          className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))]"
        >
          <ArrowLeft className="h-4 w-4" /> Bar
        </Link>
        <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Vendas do bar</h1>
        <p className="text-sm text-[rgb(var(--foreground-muted))]">{unidade.nome}</p>
      </div>

      <BarVendasFiltros options={filtroOptions} />
      <BarVendasList vendas={vendas} podeGerir={podeGerir} />

      {totalPaginas > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Paginação">
          {lista.page > 1 ? (
            <Link
              href={`/admin/bar/vendas?${queryStatus}page=${lista.page - 1}`}
              className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 font-medium hover:bg-[rgb(var(--background-subtle))]"
            >
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[rgb(var(--foreground-muted))]">
            Página {lista.page} de {totalPaginas}
          </span>
          {lista.page < totalPaginas ? (
            <Link
              href={`/admin/bar/vendas?${queryStatus}page=${lista.page + 1}`}
              className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 font-medium hover:bg-[rgb(var(--background-subtle))]"
            >
              Próximas →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}
