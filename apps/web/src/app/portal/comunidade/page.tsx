import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getFeedComunidade, marcarComunicadosLidos } from '@/lib/comunidade'
import { redirect } from 'next/navigation'
import { Pin, MessagesSquare, Megaphone } from 'lucide-react'
import { Badge } from '@torcida/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Comunidade' }

const PRIORIDADE_LABEL: Record<string, string> = {
  NORMAL: 'Normal',
  IMPORTANTE: 'Importante',
  URGENTE: 'Urgente',
}

const PRIORIDADE_VARIANT: Record<string, 'neutral' | 'warning' | 'danger'> = {
  NORMAL: 'neutral',
  IMPORTANTE: 'warning',
  URGENTE: 'danger',
}

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(
    new Date(data),
  )
}

export default async function ComunidadePage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant) redirect('/')

  // Estado de leitura vem calculado ANTES da marcação abaixo — assim esta
  // visita ainda exibe "Novo" no que acabou de chegar; na próxima, não.
  const { announcements, posts } = await getFeedComunidade(tenant.id, {
    userId: session?.user?.id,
  })

  if (session?.user?.id && announcements.length > 0) {
    await marcarComunicadosLidos(
      announcements.map((a) => a.id),
      session.user.id,
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Comunidade</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Comunicados oficiais e novidades da torcida
        </p>
      </div>

      {/* Comunicados oficiais — sempre acima do mural local, independente de
          data de publicação: conteúdo institucional sobrescreve a
          prioridade do feed local. */}
      {announcements.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            <Megaphone className="h-3.5 w-3.5" /> Comunicados oficiais
          </h2>
          {announcements.map((a) => {
            const herdado = a.tenantId !== tenant.id
            return (
              <div
                key={a.id}
                className={[
                  'rounded-xl border p-5',
                  a.prioridade === 'URGENTE'
                    ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950'
                    : a.fixado
                      ? 'border-[rgb(var(--primary)_/_0.3)] bg-[rgb(var(--primary)_/_0.04)]'
                      : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {a.lido === false && (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                      Novo
                    </span>
                  )}
                  {a.fixado && (
                    <span className="flex items-center gap-1 rounded-full bg-[rgb(var(--primary)_/_0.15)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">
                      <Pin className="h-3 w-3" /> Fixado
                    </span>
                  )}
                  <Badge variant={PRIORIDADE_VARIANT[a.prioridade]}>
                    {PRIORIDADE_LABEL[a.prioridade]}
                  </Badge>
                  {herdado && <Badge variant="primary">{a.tenant.nome}</Badge>}
                  <h3 className="font-semibold text-[rgb(var(--foreground))]">{a.titulo}</h3>
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">
                  {a.corpo}
                </p>

                <div className="mt-3 flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                  <span>{a.autor.nome ?? 'Administração'}</span>
                  <span>·</span>
                  <span>{formatarData(a.publicadoEm)}</span>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* Mural local — posts não-oficiais da própria unidade */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          <MessagesSquare className="h-3.5 w-3.5" /> Mural da comunidade
        </h2>

        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] py-12 text-center">
            <MessagesSquare className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm font-medium text-[rgb(var(--foreground-muted))]">
              Nenhum post por aqui ainda
            </p>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              Fique de olho — novidades em breve!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <div
                key={post.id}
                className={[
                  'rounded-xl border p-5',
                  post.fixado
                    ? 'border-[rgb(var(--primary)_/_0.3)] bg-[rgb(var(--primary)_/_0.04)]'
                    : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {post.fixado && (
                    <span className="flex items-center gap-1 rounded-full bg-[rgb(var(--primary)_/_0.15)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--primary))]">
                      <Pin className="h-3 w-3" /> Fixado
                    </span>
                  )}
                  {post.titulo && (
                    <h3 className="font-semibold text-[rgb(var(--foreground))]">{post.titulo}</h3>
                  )}
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">
                  {post.conteudo}
                </p>

                {post.imagemUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.imagemUrl}
                    alt=""
                    className="mt-3 max-h-96 w-full rounded-lg border border-[rgb(var(--border))] object-cover"
                  />
                )}

                <div className="mt-3 flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                  <span>{post.autor.nome ?? 'Administração'}</span>
                  <span>·</span>
                  <span>{formatarData(post.criadoEm)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
