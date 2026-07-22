import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { db } from '@torcida/db'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { Newspaper } from 'lucide-react'
import { aprovarNoticia, rejeitarNoticia } from './actions'
import { AdminActionForm } from '@/components/admin/admin-action-form'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Curadoria de Notícias' }

interface NoticiaRascunho {
  id: string
  titulo: string
  resumo: string | null
  url: string
  fonte: string
  criadoEm: Date
}

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

export default async function AdminNoticiasPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) redirect('/admin')

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  if (!hasPermission(effective, PERMISSIONS.NEWS_CURATE)) redirect('/admin')

  if (!tenant.afiliacaoId) {
    return (
      <div className="app-container py-6">
        <div className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Este tenant ainda não possui afiliação configurada para curadoria de notícias.
        </div>
      </div>
    )
  }

  const noticias: NoticiaRascunho[] = await db.noticia.findMany({
    where: { afiliacaoId: tenant.afiliacaoId, status: 'RASCUNHO' },
    orderBy: { criadoEm: 'asc' },
    select: { id: true, titulo: true, resumo: true, url: true, fonte: true, criadoEm: true },
  })

  return (
    <div className="app-container space-y-6 py-6">
      <div className="flex items-start gap-3">
        <Newspaper className="mt-0.5 h-5 w-5 text-[rgb(var(--foreground-muted))]" />
        <div>
          <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Curadoria de notícias</h1>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Aprove ou rejeite notícias em rascunho relacionadas ao seu time.
          </p>
        </div>
      </div>

      {noticias.length === 0 ? (
        <MotionEmptyState
          icon={<Newspaper className="mb-4 h-12 w-12 text-[rgb(var(--foreground-muted))]" />}
          title="Nenhuma notícia pendente"
          description="Novas notícias em rascunho da afiliação aparecem aqui para curadoria."
        />
      ) : (
        <MotionReveal>
        <div className="space-y-3">
          {noticias.map((noticia) => (
            <div
              key={noticia.id}
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[rgb(var(--foreground))]">{noticia.titulo}</p>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  {formatarData(noticia.criadoEm)}
                </p>
              </div>

              {noticia.resumo && (
                <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">{noticia.resumo}</p>
              )}

              <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">Fonte: {noticia.fonte}</p>
              <a
                href={noticia.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Abrir link da notícia
              </a>

              <div className="mt-4 flex flex-wrap gap-2">
                <AdminActionForm
                  action={aprovarNoticia.bind(null, noticia.id)}
                  success="Notícia aprovada."
                  confirm={{
                    titulo: 'Aprovar esta notícia?',
                    descricao: `“${noticia.titulo}” passa a aparecer na curadoria publicada.`,
                    labelConfirmar: 'Aprovar',
                    variante: 'success',
                    cancelled: 'Aprovação cancelada.',
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Aprovar
                  </button>
                </AdminActionForm>
                <AdminActionForm
                  action={rejeitarNoticia.bind(null, noticia.id)}
                  success="Notícia rejeitada."
                  confirm={{
                    titulo: 'Rejeitar esta notícia?',
                    descricao: `“${noticia.titulo}” será marcada como rejeitada.`,
                    labelConfirmar: 'Rejeitar',
                    variante: 'destructive',
                    cancelled: 'Rejeição cancelada.',
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                  >
                    Rejeitar
                  </button>
                </AdminActionForm>
              </div>
            </div>
          ))}
        </div>
        </MotionReveal>
      )}
    </div>
  )
}
