import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { Rss, UserCircle2, UserPlus, Video, Search, Users, Heart, Bookmark } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'
import { ComunidadeSalasMobile } from './comunidade-salas-mobile'
import { ComunidadeComunicadosSection } from './comunidade-comunicados-section'
import { ComunidadePostsSection } from './comunidade-posts-section'
import { ComunidadeAsideWidgets } from './comunidade-aside-widgets'

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

export function ComunidadeFeedShell({ tenant, currentUser, cursor, perfilPrivado = true }: ComunidadeFeedShellProps) {
  const navItems = [
    { href: '/portal/comunidade', label: 'Feed', icon: Rss, active: true },
    { href: '/portal/comunidade/rede', label: 'Minha rede', icon: Heart, active: false },
    { href: '/portal/comunidade/salvos', label: 'Salvos', icon: Bookmark, active: false },
    { href: '/portal/comunidade/busca', label: 'Buscar', icon: Search, active: false },
    { href: '/portal/comunidade/videos', label: 'Vídeos', icon: Video, active: false },
    { href: '/portal/comunidade/grupos', label: 'Grupos', icon: Users, active: false },
    {
      href: '/portal/comunidade/seguindo',
      label: 'Solicitações',
      icon: UserPlus,
      active: false,
    },
    ...(currentUser.id
      ? [
          {
            href: `/portal/comunidade/perfil/${currentUser.id}`,
            label: 'Meu perfil',
            icon: UserCircle2,
            active: false,
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
          </Link>
          <Link
            href="/portal/comunidade/rede"
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))]"
          >
            <Heart className="h-4 w-4" /> Minha rede
          </Link>
          <Link
            href="/portal/comunidade/videos"
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))]"
          >
            <Video className="h-4 w-4" /> Vídeos
          </Link>
          <Link
            href="/portal/comunidade/grupos"
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))]"
          >
            <Users className="h-4 w-4" /> Grupos
          </Link>
          <Link
            href="/portal/comunidade/busca"
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))]"
          >
            <Search className="h-4 w-4" /> Buscar
          </Link>
          <Link
            href="/portal/comunidade/seguindo"
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))]"
          >
            <UserPlus className="h-4 w-4" /> Solicitações
          </Link>
        </nav>

        <Suspense fallback={null}>
          <ComunidadeSalasMobile tenantId={tenant.id} />
        </Suspense>

        {currentUser.id && (
          <FeedComposer
            userName={currentUser.nome}
            userAvatar={currentUser.avatarUrl}
            perfilPrivado={perfilPrivado}
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
          />
        </Suspense>
      </main>
    </>
  )
}
