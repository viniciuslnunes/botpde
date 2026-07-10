import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { MessagesSquare, Megaphone } from 'lucide-react'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { CriarPostForm, PostsManager } from '@/components/admin/post-forms'
import { CriarComunicadoForm, ComunicadosManager } from '@/components/admin/comunicado-forms'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Comunidade — Admin' }

export default async function AdminComunidadePage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) redirect('/admin')

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effective = calculateEffectivePermissions(rolePermissions, overrides)

  const podePublicarComunicado = hasPermission(effective, PERMISSIONS.ANNOUNCEMENTS_PUBLISH)
  const podeGerenciarPosts = hasPermission(effective, PERMISSIONS.COMMUNITY_MANAGE)

  if (!podePublicarComunicado && !podeGerenciarPosts) redirect('/admin')

  const [comunicados, posts] = await Promise.all([
    podePublicarComunicado
      ? db.announcement.findMany({
          where: { tenantId: tenant.id },
          orderBy: [{ fixado: 'desc' }, { publicadoEm: 'desc' }],
          select: { id: true, titulo: true, corpo: true, prioridade: true, fixado: true, publicadoEm: true },
        })
      : Promise.resolve([]),
    podeGerenciarPosts
      ? db.post.findMany({
          where: { tenantId: tenant.id },
          orderBy: [{ fixado: 'desc' }, { criadoEm: 'desc' }],
          select: { id: true, titulo: true, conteudo: true, imagemUrl: true, fixado: true, criadoEm: true },
        })
      : Promise.resolve([]),
  ])

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-8 py-5">
        <div className="flex items-center gap-3">
          <MessagesSquare className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Comunidade</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Comunicados oficiais e mural de avisos para os associados
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-8">
          {podeGerenciarPosts && (
            <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Gerencie canais oficiais e comunidades temáticas em{' '}
                <a href="/portal/comunidade/canais" className="font-medium text-[rgb(var(--primary))] hover:underline">
                  Portal → Comunidade → Canais
                </a>
                .
              </p>
            </section>
          )}

          {podePublicarComunicado && (
            <section className="space-y-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                <Megaphone className="h-4 w-4" /> Comunicados oficiais
              </h2>
              <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
                <h3 className="mb-4 font-semibold text-[rgb(var(--foreground))]">Novo comunicado</h3>
                <CriarComunicadoForm />
              </div>
              <ComunicadosManager comunicados={comunicados} />
            </section>
          )}

          {podeGerenciarPosts && (
            <section className="space-y-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                <MessagesSquare className="h-4 w-4" /> Mural da comunidade
              </h2>
              <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
                <h3 className="mb-4 font-semibold text-[rgb(var(--foreground))]">Novo post</h3>
                <CriarPostForm />
              </div>
              <PostsManager posts={posts} />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
