import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { Archive, Package, Recycle, ShoppingBag, Ticket, TrendingUp } from 'lucide-react'
import { db } from '@torcida/db'
import { assertStoreView } from '@/lib/authz'
import { montarTabsModulo, permissoesEfetivasNoAdmin } from '@/lib/admin-modulos'
import { AdminModuleTabBar, AdminModuleTabs, AdminPageHeader } from '@/components/admin/ui'

const ICONE = 'h-4 w-4 shrink-0'

export default async function LojaModuloLayout({ children }: { children: ReactNode }) {
  let tenant: Awaited<ReturnType<typeof assertStoreView>>['tenant']
  try {
    ;({ tenant } = await assertStoreView())
  } catch {
    redirect('/admin')
  }

  const permissoes = await permissoesEfetivasNoAdmin()

  const [pedidosPendentes, ticketsAbertos]: [number, number] = await Promise.all([
    db.saasPedido.count({
      where: { tenantId: tenant.id, status: 'PENDENTE' },
    }),
    db.saasPedidoTicket.count({
      where: { tenantId: tenant.id, status: { in: ['ABERTO', 'ATENDENDO'] } },
    }),
  ])

  const tabs = montarTabsModulo('loja', permissoes, {
    comando: { icon: <ShoppingBag className={ICONE} /> },
    catalogo: { icon: <Package className={ICONE} /> },
    pedidos: {
      icon: <Package className={ICONE} />,
      count: pedidosPendentes,
      countClass: 'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
    },
    tickets: {
      icon: <Archive className={ICONE} />,
      count: ticketsAbertos > 0 ? ticketsAbertos : undefined,
      countClass: 'bg-[rgb(var(--color-info)_/_0.16)] text-[rgb(var(--color-info-fg))]',
    },
    brecho: { icon: <Recycle className={ICONE} /> },
    cupons: { icon: <Ticket className={ICONE} /> },
    desempenho: { icon: <TrendingUp className={ICONE} /> },
  })

  return (
    <>
      <AdminPageHeader
        title="Loja"
        description="Catálogo, pedidos, arquivo de tickets e desempenho de vendas."
        icon={<ShoppingBag className="h-5 w-5" />}
      >
        <AdminModuleTabBar tabs={tabs} />
      </AdminPageHeader>

      <div className="app-container space-y-6 py-6">
        <AdminModuleTabs tabs={tabs} chrome="panel">
          {children}
        </AdminModuleTabs>
      </div>
    </>
  )
}
