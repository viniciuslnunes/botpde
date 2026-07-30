import { redirect } from 'next/navigation'
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
    <div className="space-y-6">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Mural organizacional — cargos, departamentos e base associativa.
      </p>
      <MotionReveal>
        <OrganizacaoMural tree={tree} />
      </MotionReveal>
    </div>
  )
}
