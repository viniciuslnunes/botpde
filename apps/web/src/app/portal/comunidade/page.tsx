import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getFeedPersonalizado, type PostSocialItem } from '@/lib/feed'
import { marcarComunicadosLidos } from '@/lib/comunidade'
import { listSalasAtivas } from '@/lib/salas'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Pin,
  MessagesSquare,
  Megaphone,
  Newspaper,
  Rss,
  Video,
  UserPlus,
  UserCircle2,
  Users,
} from 'lucide-react'
import { Badge } from '@torcida/ui'
import type { Metadata } from 'next'
import { FeedComposer } from '@/components/portal/feed-composer'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { Avatar } from '@/components/portal/avatar'
import { SeguimentoButtons } from '@/components/portal/seguimento-buttons'
import type { NoticiaAprovadaItem } from '@/lib/noticias'

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

  const currentUser = {
    id: session?.user?.id ?? '',
    nome: session?.user?.name ?? null,
    avatarUrl: session?.user?.image ?? null,
  }

  const [feed, salas] = await Promise.all([
    getFeedPersonalizado(tenant.id, session?.user?.id, {
      cursor: params.cursor,
      take: 20,
      afiliacaoId: tenant.afiliacaoId,
    }),
    listSalasAtivas(tenant.id),
  ])
  const { announcements, postsSeguindo, postsSugeridos, noticias } = feed

  if (session?.user?.id && announcements.length > 0) {
    // Marcar como lido é um efeito secundário: se falhar, o feed ainda deve abrir.
    try {
      await marcarComunicadosLidos(
        announcements.map((a) => a.id),
        session.user.id,
      )
    } catch {
      // silencioso — não bloqueia a renderização do feed
    }
  }

  // Feed unificado: quem você segue + descobertas, ordenado por recência.
  const stream: PostSocialItem[] = [...postsSeguindo, ...postsSugeridos].sort(
    (a, b) => b.criadoEm.getTime() - a.criadoEm.getTime(),
  )

  // Sugestões de quem seguir a partir de autores ainda não seguidos.
  const sugestoes = Array.from(
    new Map(postsSugeridos.filter((p) => p.autor.id !== currentUser.id).map((p) => [p.autor.id, p.autor])).values(),
  ).slice(0, 4)

  const navItems = [
    { href: '/portal/comunidade', label: 'Feed', icon: Rss, active: true, badge: 0 },
    { href: '/portal/comunidade/salas', label: 'Salas ao vivo', icon: Video, active: false, badge: salas.length },
    { href: '/portal/comunidade/seguindo', label: 'Solicitações', icon: UserPlus, active: false, badge: 0 },
    ...(currentUser.id
      ? [{ href: `/portal/comunidade/perfil/${currentUser.id}`, label: 'Meu perfil', icon: UserCircle2, active: false, badge: 0 }]
      : []),
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_18rem]">
      {/* ── Trilha esquerda: identidade + navegação ── */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-4">
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
            <div className="flex items-center gap-3">
              <Avatar nome={currentUser.nome} avatarUrl={currentUser.avatarUrl} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                  {currentUser.nome ?? 'Torcedor'}
                </p>
                <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">{tenant.nome}</p>
              </div>
            </div>
          </div>

          <nav className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    item.active
                      ? 'bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]'
                      : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge > 0 && (
                    <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* ── Coluna central: salas ao vivo + composer + feed ── */}
      <main className="min-w-0 space-y-4">
        <div className="lg:hidden">
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Comunidade</h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            O feed da sua torcida e das aliadas
          </p>
        </div>

        {/* Navegação mobile em chips */}
        <nav className="flex flex-wrap gap-2 lg:hidden">
          <Link
            href="/portal/comunidade/salas"
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))]"
          >
            <Video className="h-4 w-4" /> Salas
            {salas.length > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{salas.length}</span>
            )}
          </Link>
          <Link
            href="/portal/comunidade/seguindo"
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))]"
          >
            <UserPlus className="h-4 w-4" /> Solicitações
          </Link>
        </nav>

        {salas.length > 0 && <LiveSalas salas={salas} />}

        {currentUser.id && (
          <FeedComposer userName={currentUser.nome} userAvatar={currentUser.avatarUrl} />
        )}

        {announcements.length > 0 && (
          <section className="space-y-3">
            <SectionTitle icon={Megaphone} label="Comunicados oficiais" />
            {announcements.map((a) => {
              const herdado = a.tenantId !== tenant.id
              const urgente = a.prioridade === 'URGENTE'
              return (
                <article
                  key={a.id}
                  className={[
                    'rounded-2xl border p-4',
                    urgente
                      ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
                      : 'border-[rgb(var(--primary)_/_0.3)] bg-[rgb(var(--primary)_/_0.05)]',
                  ].join(' ')}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {a.fixado && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--primary))]">
                        <Pin className="h-3.5 w-3.5" /> Fixado
                      </span>
                    )}
                    <Badge variant={PRIORIDADE_VARIANT[a.prioridade]}>
                      {PRIORIDADE_LABEL[a.prioridade]}
                    </Badge>
                    {herdado && <Badge variant="primary">{a.tenant.nome}</Badge>}
                    {a.lido === false && (
                      <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Novo
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 font-semibold text-[rgb(var(--foreground))]">{a.titulo}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">{a.corpo}</p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
                    <span>{a.autor.nome ?? 'Administração'}</span>
                    <span>·</span>
                    <span>{formatarData(a.publicadoEm)}</span>
                  </div>
                </article>
              )
            })}
          </section>
        )}

        {/* Notícias do time — só aparecem na coluna central quando não há trilha direita */}
        {noticias.length > 0 && (
          <section className="space-y-3 xl:hidden">
            <SectionTitle icon={Newspaper} label="Do seu time" />
            {noticias.slice(0, 3).map((n) => (
              <NoticiaCard key={n.id} noticia={n} />
            ))}
          </section>
        )}

        <section className="space-y-4">
          <SectionTitle icon={MessagesSquare} label="Feed da comunidade" />
          {stream.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border))] py-14 text-center">
              <MessagesSquare className="mb-3 h-9 w-9 text-[rgb(var(--foreground-muted))]" />
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                O feed começa com você
              </p>
              <p className="mt-1 max-w-xs text-xs text-[rgb(var(--foreground-muted))]">
                Publique a primeira mensagem ou siga outros membros para ver o que a torcida está falando.
              </p>
            </div>
          ) : (
            stream.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                showTenantBadge={post.tenantId !== tenant.id}
                currentUser={currentUser}
              />
            ))
          )}
        </section>

        {feed.pageInfo.hasMore && feed.pageInfo.nextCursor && (
          <div className="flex justify-center pt-2">
            <Link
              href={`/portal/comunidade?cursor=${encodeURIComponent(feed.pageInfo.nextCursor)}`}
              className="rounded-full border border-[rgb(var(--border))] px-5 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
            >
              Carregar mais
            </Link>
          </div>
        )}
      </main>

      {/* ── Trilha direita: notícias + sugestões ── */}
      <aside className="hidden xl:block">
        <div className="sticky top-20 space-y-4">
          {noticias.length > 0 && (
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
              <SectionTitle icon={Newspaper} label="Do seu time" />
              <div className="mt-3 space-y-3">
                {noticias.slice(0, 4).map((n) => (
                  <a
                    key={n.id}
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex gap-3"
                  >
                    {n.embedThumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={n.embedThumbnail}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-xs font-medium text-[rgb(var(--foreground))] group-hover:text-[rgb(var(--primary))]">
                        {n.titulo}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-[rgb(var(--foreground-muted))]">{n.fonte}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {sugestoes.length > 0 && (
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
              <SectionTitle icon={Users} label="Para seguir" />
              <div className="mt-3 space-y-3">
                {sugestoes.map((autor) => (
                  <div key={autor.id} className="flex items-center gap-2">
                    <Link href={`/portal/comunidade/perfil/${autor.id}`}>
                      <Avatar nome={autor.nome} avatarUrl={autor.avatarUrl} size="sm" />
                    </Link>
                    <Link
                      href={`/portal/comunidade/perfil/${autor.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-[rgb(var(--foreground))] hover:underline"
                    >
                      {autor.nome ?? 'Membro'}
                    </Link>
                    <SeguimentoButtons mode="follow" userId={autor.id} status={null} isSelf={autor.id === currentUser.id} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function SectionTitle({ icon: Icon, label }: { icon: typeof MessagesSquare; label: string }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
      <Icon className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
      {label}
    </h2>
  )
}

function LiveSalas({ salas }: { salas: Awaited<ReturnType<typeof listSalasAtivas>> }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          Ao vivo agora
        </h2>
        <Link href="/portal/comunidade/salas" className="text-xs font-medium text-[rgb(var(--primary))] hover:underline">
          Ver todas
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {salas.slice(0, 2).map((sala) => (
          <Link
            key={sala.id}
            href={`/portal/comunidade/salas/${sala.id}`}
            className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3.5 transition-colors hover:border-[rgb(var(--primary)_/_0.5)]"
          >
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 shrink-0 text-red-500" />
              <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">{sala.titulo}</p>
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
                <Users className="h-3.5 w-3.5" />
                {sala._count.participantes} online
              </span>
              <span className="rounded-full bg-[rgb(var(--primary))] px-3 py-1 text-xs font-semibold text-white">
                Entrar
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function NoticiaCard({ noticia: n }: { noticia: NoticiaAprovadaItem }) {
  return (
    <a
      href={n.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:bg-[rgb(var(--background-subtle))]"
    >
      {n.embedThumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={n.embedThumbnail} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      )}
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-medium text-[rgb(var(--foreground))]">{n.titulo}</p>
        <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">{n.fonte}</p>
      </div>
    </a>
  )
}
