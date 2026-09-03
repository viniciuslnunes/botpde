import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { Inbox, Package, Recycle, ShoppingBag, Ticket, TrendingUp } from 'lucide-react'
import { db } from '@torcida/db'
import { assertStoreView } from '@/lib/authz'
import { montarTabsModulo, permissoesEfetivasNoAdmin } from '@/lib/admin-modulos'
import { AdminModuleTabBar, AdminModuleTabs, AdminPageHeader } from '@/components/admin/ui'
import { PERMISSIONS, hasPermission } from '@torcida/types'

const ICONE = 'h-4 w-4 shrink-0'

export default async function LojaModuloLayout({ children }: { children: ReactNode }) {
  let tenant: Awaited<ReturnType<typeof assertStoreView>>['tenant']
  try {
    ;({ tenant } = await assertStoreView())
  } catch {
    redirect('/admin')
  }

  const permissoes = await permissoesEfetivasNoAdmin()
  const podeGerir = hasPermission(permissoes, PERMISSIONS.STORE_MANAGE)

  const [pedidosPendentes, ticketsAbertos]: [number, number] = await Promise.all([
    db.saasPedido.count({
      where: { tenantId: tenant.id, status: 'PENDENTE' },
    }),
    db.saasPedidoTicket.count({
      where: { tenantId: tenant.id, status: { in: ['ABERTO', 'ATENDENDO'] } },
    }),
  ])

  const pendenciasCount =
    pedidosPendentes + ticketsAbertos > 0
      ? pedidosPendentes + (ticketsAbertos > 0 ? 1 : 0)
      : 0

  const tabs = montarTabsModulo('loja', permissoes, {
    comando: {
      icon: <ShoppingBag className={ICONE} />,
      count: podeGerir && pendenciasCount > 0 ? pendenciasCount : undefined,
      countClass: 'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
    },
    atendimento: {
      icon: <Inbox className={ICONE} />,
      count: ticketsAbertos > 0 ? ticketsAbertos : undefined,
      countClass: 'bg-[rgb(var(--color-info)_/_0.16)] text-[rgb(var(--color-info-fg))]',
    },
    catalogo: { icon: <Package className={ICONE} /> },
    pedidos: {
      icon: <Package className={ICONE} />,
      count: pedidosPendentes > 0 ? pedidosPendentes : undefined,
      countClass: 'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]',
    },
    brecho: { icon: <Recycle className={ICONE} /> },
    cupons: { icon: <Ticket className={ICONE} /> },
    desempenho: { icon: <TrendingUp className={ICONE} /> },
  })
  return (
    <>
      <AdminPageHeader
        title="Loja"
        description="Catálogo, pedidos, atendimento pós-compra e desempenho de vendas."
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
