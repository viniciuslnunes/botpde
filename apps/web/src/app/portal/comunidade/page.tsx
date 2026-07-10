import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getFeedPersonalizado, type PostSocialItem } from '@/lib/feed'
import { marcarComunicadosLidos } from '@/lib/comunidade'
import { listSalasAtivas } from '@/lib/salas'
import { listConversas, type ConversaInboxItem } from '@/lib/mensageria'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  MessagesSquare,
  Newspaper,
  Rss,
  Video,
  UserPlus,
  UserCircle2,
  Users,
} from 'lucide-react'
import type { Metadata } from 'next'
import { FeedComposer } from '@/components/portal/feed-composer'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { Avatar } from '@/components/portal/avatar'
import { SeguimentoButtons } from '@/components/portal/seguimento-buttons'
import { ComunicadosSection } from '@/components/portal/comunicados-section'
import { ComunidadeSalasPanel } from '@/components/portal/comunidade-salas-panel'
import { ComunidadeChatPanel } from '@/components/portal/comunidade-chat-panel'
import type { InboxItemDto } from '@/lib/mensageria-client'
import type { SalaAtivaListItem } from '@/lib/salas'

export const metadata: Metadata = { title: 'Comunidade' }

function toInboxDto(item: ConversaInboxItem): InboxItemDto {
  return {
    ...item,
    atualizadoEm: item.atualizadoEm.toISOString(),
    ultimaMensagem: item.ultimaMensagem
      ? { ...item.ultimaMensagem, criadoEm: item.ultimaMensagem.criadoEm.toISOString() }
      : null,
  }
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

  const [feed, salas, conversasRaw] = await Promise.all([
    getFeedPersonalizado(tenant.id, session?.user?.id, {
      cursor: params.cursor,
      take: 20,
      afiliacaoId: tenant.afiliacaoId,
    }),
    listSalasAtivas(tenant.id),
    session?.user?.id
      ? listConversas(session.user.id).catch((): ConversaInboxItem[] => [])
      : Promise.resolve([] as ConversaInboxItem[]),
  ])
  const { announcements, postsSeguindo, postsSugeridos, noticias } = feed

  const temComunicadosNovos = announcements.some((a) => a.lido === false)
  const comunicadosItems = announcements.map((a) => ({
    id: a.id,
    tenantId: a.tenantId,
    titulo: a.titulo,
    corpo: a.corpo,
    prioridade: a.prioridade,
    fixado: a.fixado,
    publicadoEm: a.publicadoEm.toISOString(),
    tenantNome: a.tenant.nome,
    autorNome: a.autor.nome,
    lido: a.lido,
  }))

  if (session?.user?.id && announcements.length > 0) {
    try {
      await marcarComunicadosLidos(
        announcements.map((a) => a.id),
        session.user.id,
      )
    } catch {
      // silencioso — não bloqueia a renderização do feed
    }
  }

  const conversas = conversasRaw.map(toInboxDto)

  const stream: PostSocialItem[] = [...postsSeguindo, ...postsSugeridos].sort(
    (a, b) => b.criadoEm.getTime() - a.criadoEm.getTime(),
  )

  const sugestoes = Array.from(
    new Map(postsSugeridos.filter((p) => p.autor.id !== currentUser.id).map((p) => [p.autor.id, p.autor])).values(),
  ).slice(0, 4)

  const navItems = [
    { href: '/portal/comunidade', label: 'Feed', icon: Rss, active: true, badge: 0 },
    { href: '/portal/comunidade/seguindo', label: 'Solicitações', icon: UserPlus, active: false, badge: 0 },
    ...(currentUser.id
      ? [{ href: `/portal/comunidade/perfil/${currentUser.id}`, label: 'Meu perfil', icon: UserCircle2, active: false, badge: 0 }]
      : []),
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
      {/* ── Trilha esquerda: identidade + navegação + widgets ── */}
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

          {noticias.length > 0 && (
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
              <SectionTitle icon={Newspaper} label="Do seu time" />
              <div className="mt-3 space-y-2.5">
                {noticias.slice(0, 4).map((n) => (
                  <a
                    key={n.id}
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block"
                  >
                    <p className="line-clamp-2 text-xs font-medium text-[rgb(var(--foreground))] group-hover:text-[rgb(var(--primary))]">
                      {n.titulo}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[rgb(var(--foreground-muted))]">{n.fonte}</p>
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
                      className="min-w-0 flex-1 truncate text-xs font-medium text-[rgb(var(--foreground))] hover:underline"
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

      {/* ── Coluna central: composer + comunicados + feed ── */}
      <main className="min-w-0 space-y-4">
        <div className="lg:hidden">
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Comunidade</h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            O feed da sua torcida e das aliadas
          </p>
        </div>

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

        {salas.length > 0 && (
          <div className="xl:hidden">
            <MobileLiveSalas salas={salas} />
          </div>
        )}

        {currentUser.id && (
          <FeedComposer userName={currentUser.nome} userAvatar={currentUser.avatarUrl} />
        )}

        <ComunicadosSection
          announcements={comunicadosItems}
          tenantId={tenant.id}
          defaultExpanded={temComunicadosNovos}
        />

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

      {/* ── Trilha direita: salas + chat ── */}
      <aside className="hidden xl:block">
        <div className="sticky top-20 space-y-4">
          <ComunidadeSalasPanel salas={salas} />
          {currentUser.id && (
            <ComunidadeChatPanel initialConversas={conversas} currentUserId={currentUser.id} />
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

function MobileLiveSalas({ salas }: { salas: SalaAtivaListItem[] }) {
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
