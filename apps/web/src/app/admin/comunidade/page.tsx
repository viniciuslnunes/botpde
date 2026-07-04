import { db } from '@torcida/db'
import { redirect } from 'next/navigation'
import { MessagesSquare } from 'lucide-react'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { CriarPostForm, PostsManager } from '@/components/admin/post-forms'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Comunidade — Admin' }

export default async function AdminComunidadePage() {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.COMMUNITY_MANAGE))
  } catch {
    redirect('/admin')
  }

  const posts = await db.post.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ fixado: 'desc' }, { criadoEm: 'desc' }],
    select: { id: true, titulo: true, conteudo: true, imagemUrl: true, fixado: true, criadoEm: true },
  })

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-8 py-5">
        <div className="flex items-center gap-3">
          <MessagesSquare className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Comunidade</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Mural de avisos e novidades para os associados
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
            <h2 className="mb-4 font-semibold text-[rgb(var(--foreground))]">Novo post</h2>
            <CriarPostForm />
          </div>

          <PostsManager posts={posts} />
        </div>
      </div>
    </div>
  )
}
