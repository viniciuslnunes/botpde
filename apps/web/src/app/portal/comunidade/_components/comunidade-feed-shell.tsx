import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { Rss, UserCircle2, UserPlus, Video, Search, Users, Heart, Bookmark, Bell, Radio } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'
import { ComunidadeSalasMobile } from './comunidade-salas-mobile'
import { ComunidadeComunicadosSection } from './comunidade-comunicados-section'
import { ComunidadePostsSection } from './comunidade-posts-section'
import { ComunidadeAsideWidgets } from './comunidade-aside-widgets'
import { ComunidadeStoriesSection } from './comunidade-stories-section'
import { ComunidadeFeedTabs } from './comunidade-feed-tabs'

const FeedComposer = dynamic(
  () => import('@/components/portal/feed-composer').then((mod) => mod.FeedComposer),
  {
    loading: () => (
      <div className="h-24 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
    ),
  },
)

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface ComunidadeFeedShellProps {
  tenant: { id: string; nome: string; afiliacaoId: string | null }
  currentUser: CurrentUser
  cursor?: string
  perfilPrivado?: boolean
  /** `data` em ISO — serializado na page antes de cruzar para o FeedComposer (client). */
  eventosComposer?: import('@/lib/eventos').EventoComposerItem[]
  navBadges?: { notificacoesNaoLidas: number; solicitacoesPendentes: number }
  bloqueioPublicacao?: string | null
  somentePublico?: boolean
  filtro?: 'descobrir' | 'seguindo'
}

function ComunicadosFallback() {
  return <div className="h-16 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
}

function PostsFallback() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-36 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
      ))}
    </div>
  )
}

function AsideWidgetsFallback() {
  return (
    <>
      <div className="h-32 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
      <div className="h-40 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
    </>
  )
}

export function ComunidadeFeedShell({
  tenant,
  currentUser,
  cursor,
  perfilPrivado = true,
  eventosComposer = [],
  navBadges = { notificacoesNaoLidas: 0, solicitacoesPendentes: 0 },
  bloqueioPublicacao = null,
  somentePublico = false,
  filtro = 'descobrir',
}: ComunidadeFeedShellProps) {
  const navItems = [
    { href: '/portal/comunidade', label: 'Feed', icon: Rss, active: true, badge: 0 },
    { href: '/portal/comunidade/rede', label: 'Minha rede', icon: Heart, active: false, badge: 0 },
    { href: '/portal/comunidade/salvos', label: 'Salvos', icon: Bookmark, active: false, badge: 0 },
    { href: '/portal/comunidade/busca', label: 'Buscar', icon: Search, active: false, badge: 0 },
    { href: '/portal/comunidade/videos', label: 'Vídeos', icon: Video, active: false, badge: 0 },
    { href: '/portal/comunidade/grupos', label: 'Grupos', icon: Users, active: false, badge: 0 },
    { href: '/portal/comunidade/canais', label: 'Canais', icon: Radio, active: false, badge: 0 },
    {
      href: '/portal/comunidade/notificacoes',
      label: 'Notificações',
      icon: Bell,
      active: false,
      badge: navBadges.notificacoesNaoLidas,
    },
    {
      href: '/portal/comunidade/seguindo',
      label: 'Solicitações',
      icon: UserPlus,
      active: false,
      badge: navBadges.solicitacoesPendentes,
    },
    ...(currentUser.id
      ? [
          {
            href: `/portal/comunidade/perfil/${currentUser.id}`,
            label: 'Meu perfil',
            icon: UserCircle2,
            active: false,
            badge: 0,
          },
        ]
      : []),
  ]

  return (
    <>
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
                    <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[10px] font-bold leading-5 text-white">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          <Suspense fallback={<AsideWidgetsFallback />}>
            <ComunidadeAsideWidgets
              tenantId={tenant.id}
              afiliacaoId={tenant.afiliacaoId}
              currentUserId={currentUser.id || undefined}
            />
          </Suspense>
        </div>
      </aside>

      <main className="min-w-0 space-y-4">
        <div className="sticky top-14 z-20 -mx-4 bg-[rgb(var(--background-subtle))]/85 px-4 pt-1 backdrop-blur-md sm:top-14 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
          <Suspense fallback={<div className="h-9 border-b border-[rgb(var(--border))]" />}>
            <ComunidadeFeedTabs />
          </Suspense>
        </div>

        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
          {[
            { href: '/portal/comunidade/salas', label: 'Salas', icon: Video },
            { href: '/portal/comunidade/rede', label: 'Minha rede', icon: Heart },
            { href: '/portal/comunidade/grupos', label: 'Grupos', icon: Users },
            { href: '/portal/comunidade/canais', label: 'Canais', icon: Radio },
            { href: '/portal/comunidade/salvos', label: 'Salvos', icon: Bookmark },
            { href: '/portal/comunidade/seguindo', label: 'Solicitações', icon: UserPlus },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
        </nav>

        <Suspense fallback={null}>
          <ComunidadeSalasMobile tenantId={tenant.id} />
        </Suspense>

        {currentUser.id && (
          <Suspense
            fallback={
              <div className="h-20 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
            }
          >
            <ComunidadeStoriesSection tenantId={tenant.id} currentUser={currentUser} />
          </Suspense>
        )}

        {currentUser.id && (
          <FeedComposer
            userName={currentUser.nome}
            userAvatar={currentUser.avatarUrl}
            perfilPrivado={perfilPrivado}
            eventos={eventosComposer}
            bloqueioPublicacao={bloqueioPublicacao}
            somentePublico={somentePublico}
          />
        )}

        <Suspense fallback={<ComunicadosFallback />}>
          <ComunidadeComunicadosSection tenantId={tenant.id} currentUserId={currentUser.id} />
        </Suspense>

        <Suspense fallback={<PostsFallback />}>
          <ComunidadePostsSection
            tenantId={tenant.id}
            currentUser={currentUser}
            cursor={cursor}
            filtro={filtro}
          />
        </Suspense>
      </main>
    </>
  )
}
