import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ClipboardCheck } from 'lucide-react'
import { db } from '@torcida/db'
import type { Tenant } from '@torcida/db'
import type { Session } from 'next-auth'
import type { Metadata } from 'next'
import { calculateEffectivePermissions, hasPermission, PERMISSIONS } from '@torcida/types'
import { assertAffiliationManage } from '@/lib/authz'
import { getUserPermissionsInTenant } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { AdminPageHeader } from '@/components/admin/ui'
import { AfiliacaoPedidos } from './_components/afiliacao-pedidos'

export const metadata: Metadata = { title: 'Solicitações de afiliação — Admin' }

function PedidosSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex gap-2 border-b border-[rgb(var(--border))] pb-2">
        <div className="h-8 w-24 rounded-lg bg-[rgb(var(--border)_/_0.45)]" />
        <div className="h-8 w-24 rounded-lg bg-[rgb(var(--border)_/_0.45)]" />
        <div className="h-8 w-24 rounded-lg bg-[rgb(var(--border)_/_0.45)]" />
      </div>
      <div className="h-56 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
      <div className="h-56 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
    </div>
  )
}

/**
 * Fila de solicitações de unidade (subsede/PDE) — proposta §9.
 * Gate: AFFILIATION_MANAGE. Decidir (aprovar/recusar/editar) só owner/super-admin.
 */
export default async function AfiliacoesPage() {
  let tenant: Tenant
  let session: Session
  try {
    ;({ session, tenant } = await assertAffiliationManage())
  } catch {
    redirect('/admin')
  }

  const isSuper = isSuperAdminEmail(session.user.email)
  let podeDecidir = isSuper
  if (!isSuper) {
    const {
      rolePermissions,
      overrides,
    }: { rolePermissions: string[]; overrides: { permission: string; granted: boolean }[] } =
      await getUserPermissionsInTenant(session.user.id, tenant.id)
    const effective: string[] = calculateEffectivePermissions(rolePermissions, overrides)
    if (hasPermission(effective, PERMISSIONS.AFFILIATION_MANAGE)) {
      const owner: { id: string } | null = await db.userRole.findFirst({
        where: {
          userId: session.user.id,
          tenantId: tenant.id,
          role: { isSystem: true, nome: 'owner' },
        },
        select: { id: true },
      })
      podeDecidir = Boolean(owner)
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        icon={<ClipboardCheck className="h-5 w-5" />}
        title="Solicitações de afiliação"
        description="Revise foto, mapa, provas e contato de cada pedido — o Presidente aprova e a unidade ganha portal próprio."
      />

      <div className="app-container min-w-0 flex-1 py-5 sm:py-8">
        <Suspense fallback={<PedidosSkeleton />}>
          <AfiliacaoPedidos tenantId={tenant.id} podeDecidir={podeDecidir} />
        </Suspense>
      </div>
    </div>
  )
}
