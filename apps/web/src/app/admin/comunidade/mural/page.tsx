import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { MessagesSquare } from 'lucide-react'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
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
    <div className="flex flex-col h-full">
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container flex items-center gap-3">
          <MessagesSquare className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Mural da comunidade</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Avisos internos publicados no mural, fora do fluxo de comunicados oficiais
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto py-6">
        <div className="app-container space-y-6">
          <MotionReveal>
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
              <h3 className="mb-4 font-semibold text-[rgb(var(--foreground))]">Novo post</h3>
              <CriarPostForm />
            </div>
          </MotionReveal>
          <MotionReveal index={1}>
            <PostsManager posts={posts} />
          </MotionReveal>
        </div>
      </div>
    </div>
  )
}
