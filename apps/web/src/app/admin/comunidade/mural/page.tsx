import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { AdminCreateDisclosure } from '@/components/admin/ui'
import { CriarPostForm, PostsManager } from '@/components/admin/post-forms'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mural — Comunidade' }

export default async function AdminMuralPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) redirect('/admin')

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  if (!hasPermission(effective, PERMISSIONS.COMMUNITY_MANAGE)) redirect('/admin/comunidade')

  const posts = await db.post.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ fixado: 'desc' }, { criadoEm: 'desc' }],
    select: { id: true, titulo: true, conteudo: true, imagemUrl: true, fixado: true, criadoEm: true },
  })

  return (
    <>
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Avisos internos publicados no mural, fora do fluxo de comunicados oficiais.
      </p>

      <MotionReveal>
        <AdminCreateDisclosure label="Novo post" title="Novo post no mural">
          <CriarPostForm />
        </AdminCreateDisclosure>
      </MotionReveal>
      <MotionReveal index={1}>
        <PostsManager posts={posts} />
      </MotionReveal>
    </>
  )
}
