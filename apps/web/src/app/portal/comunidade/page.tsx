import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getFeedPersonalizado } from '@/lib/feed'
import { marcarComunicadosLidos } from '@/lib/comunidade'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Pin, MessagesSquare, Megaphone, ChevronRight, Newspaper } from 'lucide-react'
import { Badge } from '@torcida/ui'
import type { Metadata } from 'next'
import { FeedComposer } from '@/components/portal/feed-composer'
import { FeedPostCard } from '@/components/portal/feed-post-card'

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

export default async function ComunidadePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>
}) {
  const params = await searchParams
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant) redirect('/')

  // Estado de leitura vem calculado ANTES da marcação abaixo — assim esta
  // visita ainda exibe "Novo" no que acabou de chegar; na próxima, não.
  const feed = await getFeedPersonalizado(tenant.id, session?.user?.id, {
    cursor: params.cursor,
    take: 20,
    afiliacaoId: tenant.afiliacaoId,
  })
  const { announcements, postsSeguindo, postsSugeridos, noticias } = feed

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
          Feed social da torcida e torcidas aliadas
        </p>
      </div>

      <nav className="flex items-center gap-2">
        <span className="rounded-lg bg-[rgb(var(--primary)_/_0.12)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--primary))]">
          Feed
        </span>
        <Link
          href="/portal/comunidade/seguindo"
          className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          Solicitações <ChevronRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/portal/comunidade/salas"
          className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          Salas <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </nav>

      <FeedComposer />

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

      {noticias.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            <Newspaper className="h-3.5 w-3.5" /> Do seu time
          </h2>
          <div className="space-y-4">
            {noticias.map((n) => (
              <a
                key={n.id}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 transition-colors hover:bg-[rgb(var(--background-subtle))]"
              >
                <div className="flex gap-4">
                  {n.embedThumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={n.embedThumbnail}
                      alt=""
                      className="h-20 w-20 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-[rgb(var(--foreground))]">{n.titulo}</p>
                    {n.resumo && (
                      <p className="mt-1 line-clamp-2 text-sm text-[rgb(var(--foreground-muted))]">
                        {n.resumo}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">{n.fonte}</p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          <MessagesSquare className="h-3.5 w-3.5" /> Seguindo
        </h2>

        {postsSeguindo.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgb(var(--border))] py-12 text-center">
            <MessagesSquare className="mb-2 h-8 w-8 text-[rgb(var(--foreground-muted))]" />
            <p className="text-sm font-medium text-[rgb(var(--foreground-muted))]">
              Sem posts de perfis seguidos
            </p>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              Siga outros membros para personalizar seu feed.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {postsSeguindo.map((post) => (
              <FeedPostCard key={post.id} post={post} showTenantBadge={post.tenantId !== tenant.id} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          <MessagesSquare className="h-3.5 w-3.5" /> Sugeridos
        </h2>
        {postsSugeridos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-6 text-sm text-[rgb(var(--foreground-muted))]">
            Nenhuma sugestão disponível no momento.
          </div>
        ) : (
          <div className="space-y-4">
            {postsSugeridos.map((post) => (
              <FeedPostCard key={post.id} post={post} showTenantBadge={post.tenantId !== tenant.id} />
            ))}
          </div>
        )}
      </section>

      {feed.pageInfo.hasMore && feed.pageInfo.nextCursor && (
        <div className="flex justify-center">
          <Link
            href={`/portal/comunidade?cursor=${encodeURIComponent(feed.pageInfo.nextCursor)}`}
            className="rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            Carregar mais
          </Link>
        </div>
      )}
    </div>
  )
}
