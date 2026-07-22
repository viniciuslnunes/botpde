import { redirect } from 'next/navigation'
import { Network } from 'lucide-react'
import { assertPermission } from '@/lib/authz'
import { getOrganizacaoTree } from '@/lib/organizacao-tree'
import { OrganizacaoMural } from '@/components/admin/organizacao-mural'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { PERMISSIONS } from '@torcida/types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Hierarquia — Admin' }

export default async function HierarquiaPage() {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE))
  } catch {
    redirect('/admin')
  }

  const tree = await getOrganizacaoTree(tenant.id, tenant.nome)

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container flex items-center gap-3">
          <Network className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Hierarquia</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Mural organizacional de {tenant.nome} — cargos, departamentos e base associativa
            </p>
          </div>
        </div>
      </div>

      <div className="py-6">
        <div className="app-container">
          <MotionReveal>
            <OrganizacaoMural tree={tree} />
          </MotionReveal>
        </div>
      </div>
    </div>
  )
}
