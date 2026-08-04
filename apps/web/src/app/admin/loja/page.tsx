import { Suspense } from 'react'
import Link from 'next/link'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { redirect } from 'next/navigation'
import { Package, ShoppingBag, Ticket } from 'lucide-react'
import { carregarDirecaoLoja } from '@/lib/loja-direcao'
import {
  AdminInboxList,
  DirecaoInboxSkeleton,
  DirecaoKpisSkeleton,
  KpiGrid,
  StatCard,
} from '@/components/admin/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Comando — Loja' }

async function LojaKpis({ tenantId }: { tenantId: string }) {
  const ops = await carregarDirecaoLoja(tenantId)
  return (
    <KpiGrid cols={3}>
      <StatCard
        label="Pedidos pendentes"
        value={ops.pedidosPendentes}
        tone={ops.pedidosPendentes > 0 ? 'warning' : 'default'}
        icon={<ShoppingBag className="h-5 w-5" />}
        href="/admin/loja/pedidos?status=PENDENTE"
      />
      <StatCard
        label="Tickets abertos"
        value={ops.ticketsAbertos}
        tone={ops.ticketsAbertos > 0 ? 'warning' : 'default'}
        icon={<Ticket className="h-5 w-5" />}
        href="/admin/loja/tickets?filtro=abertos"
      />
      <StatCard
        label="Sem estoque"
        value={ops.rupturas.length}
        tone={ops.rupturas.length > 0 ? 'danger' : 'default'}
        icon={<Package className="h-5 w-5" />}
        href="/admin/loja/produtos"
      />
    </KpiGrid>
  )
}

async function LojaInbox({ tenantId }: { tenantId: string }) {
  const ops = await carregarDirecaoLoja(tenantId)
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Precisa de você
          </h2>
          <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
            Confirme pedidos na fila — catálogo fica na aba Catálogo.
          </p>
        </div>
        <Link
          href="/admin/loja/produtos"
          className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Ir ao catálogo
        </Link>
      </div>
      <AdminInboxList
        itens={ops.pendencias}
        podeAgir
        emptyTitle="Loja em dia."
        emptyDescription="Sem pedidos pendentes, tickets abertos ou ruptura recente."
      />
    </section>
  )
}

export default async function AdminLojaComandoPage() {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE))
  } catch {
    redirect('/admin/loja/pedidos')
  }

  return (
    <div className="space-y-6">
      <Suspense fallback={<DirecaoKpisSkeleton cols={3} />}>
        <LojaKpis tenantId={tenant.id} />
      </Suspense>
      <Suspense fallback={<DirecaoInboxSkeleton />}>
        <LojaInbox tenantId={tenant.id} />
      </Suspense>
    </div>
  )
}
