import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessagesSquare, Megaphone, ArrowRight } from 'lucide-react'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Comunidade — Admin' }

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

export default async function AdminComunidadePage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) redirect('/admin')

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effective = calculateEffectivePermissions(rolePermissions, overrides)

  const podePublicarComunicado = hasPermission(effective, PERMISSIONS.ANNOUNCEMENTS_PUBLISH)
  const podeGerenciarPosts = hasPermission(effective, PERMISSIONS.COMMUNITY_MANAGE)

  if (!podePublicarComunicado && !podeGerenciarPosts) redirect('/admin')

  const [comunicadosCount, ultimoComunicado, postsCount, ultimoPost] = await Promise.all([
    podePublicarComunicado ? db.announcement.count({ where: { tenantId: tenant.id } }) : Promise.resolve(0),
    podePublicarComunicado
      ? db.announcement.findFirst({
          where: { tenantId: tenant.id },
          orderBy: { publicadoEm: 'desc' },
          select: { titulo: true, publicadoEm: true },
        })
      : Promise.resolve(null),
    podeGerenciarPosts ? db.post.count({ where: { tenantId: tenant.id } }) : Promise.resolve(0),
    podeGerenciarPosts
      ? db.post.findFirst({
          where: { tenantId: tenant.id },
          orderBy: { criadoEm: 'desc' },
          select: { titulo: true, conteudo: true, criadoEm: true },
        })
      : Promise.resolve(null),
  ])

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-5">
        <div className="app-container flex items-center gap-3">
          <MessagesSquare className="h-5 w-5 text-[rgb(var(--foreground-muted))]" />
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Comunidade</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Comunicados oficiais e mural de avisos para os associados
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto py-6">
        <div className="app-container space-y-6">
          {podeGerenciarPosts && (
            <MotionReveal index={0}>
              <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
                <p className="text-sm text-[rgb(var(--foreground-muted))]">
                  Gerencie canais oficiais e comunidades temáticas em{' '}
                  <Link href="/portal/comunidade/canais" className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline">
                    Portal → Comunidade → Canais
                  </Link>
                  .
                </p>
              </section>
            </MotionReveal>
          )}

          <div className="grid gap-6 sm:grid-cols-2">
            {podePublicarComunicado && (
              <MotionReveal index={1}>
                <Link
                  href="/admin/comunidade/comunicados"
                  className="group flex h-full flex-col rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 transition-colors hover:border-[rgb(var(--color-primary-fg))]/40"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    <Megaphone className="h-4 w-4" /> Comunicados oficiais
                  </div>
                  <p className="mt-2 text-2xl font-bold text-[rgb(var(--foreground))]">{comunicadosCount}</p>
                  <p className="text-sm text-[rgb(var(--foreground-muted))]">publicados</p>
                  <div className="mt-4 flex-1 text-sm text-[rgb(var(--foreground-muted))]">
                    {ultimoComunicado ? (
                      <p>
                        Último: <span className="text-[rgb(var(--foreground))]">{ultimoComunicado.titulo}</span>{' '}
                        · {formatarData(ultimoComunicado.publicadoEm)}
                      </p>
                    ) : (
                      <p>Nenhum comunicado publicado ainda.</p>
                    )}
                  </div>
                  <span className="mt-4 flex items-center gap-1 text-sm font-medium text-[rgb(var(--color-primary-fg))]">
                    Abrir comunicados
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </MotionReveal>
            )}

            {podeGerenciarPosts && (
              <MotionReveal index={2}>
                <Link
                  href="/admin/comunidade/mural"
                  className="group flex h-full flex-col rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 transition-colors hover:border-[rgb(var(--color-primary-fg))]/40"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    <MessagesSquare className="h-4 w-4" /> Mural da comunidade
                  </div>
                  <p className="mt-2 text-2xl font-bold text-[rgb(var(--foreground))]">{postsCount}</p>
                  <p className="text-sm text-[rgb(var(--foreground-muted))]">posts</p>
                  <div className="mt-4 flex-1 text-sm text-[rgb(var(--foreground-muted))]">
                    {ultimoPost ? (
                      <p>
                        Último:{' '}
                        <span className="text-[rgb(var(--foreground))]">
                          {ultimoPost.titulo || ultimoPost.conteudo.slice(0, 60)}
                        </span>{' '}
                        · {formatarData(ultimoPost.criadoEm)}
                      </p>
                    ) : (
                      <p>Nenhum post publicado ainda.</p>
                    )}
                  </div>
                  <span className="mt-4 flex items-center gap-1 text-sm font-medium text-[rgb(var(--color-primary-fg))]">
                    Abrir mural
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </MotionReveal>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
