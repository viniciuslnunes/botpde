import Link from 'next/link'
import { Suspense } from 'react'
import { Video, Users, Heart, Bookmark, UserPlus, Radio, ListOrdered, Scale } from 'lucide-react'
import { ComunidadeSalasMobile } from './comunidade-salas-mobile'
import { ComunidadeComunicadosSection } from './comunidade-comunicados-section'
import { ComunidadePostsSection } from './comunidade-posts-section'
import { ComunidadeFeedBootstrap } from './comunidade-feed-bootstrap'
import { ComunidadeAsideWidgets } from './comunidade-aside-widgets'
import { ComunidadeStoriesSection } from './comunidade-stories-section'
import { ComunidadeStickySearchChrome } from './comunidade-sticky-search-chrome'
import { FeedLiveBanner } from './feed-live-banner'
import { ComunidadeFeedNav, ComunidadeFeedNavFallback } from './comunidade-feed-nav'
import { ComunidadeComposerSection } from './comunidade-composer-section'
import {
  ComunidadeUserCardSection,
  ComunidadeUserCardFallback,
} from './comunidade-user-card-section'
import type { SalaAtivaListItem } from '@/lib/salas'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

interface ComunidadeFeedShellProps {
  tenant: {
    id: string
    nome: string
    afiliacaoId: string | null
    balancoFinanceiroVisivel?: boolean
  }
  currentUser: CurrentUser
  cursor?: string
  filtro?: 'descobrir' | 'seguindo' | 'grupos' | 'grupos' | 'grupos' | 'grupos'
  /** Clube do torcedor global (banner quando feed usa tenant proxy). */
  clubeNacional?: { id: string; nome: string; apelido: string | null } | null
  /** Banner CN — true enquanto o composer carrega o estado real. */
  somentePublicoHint?: boolean
  salasAtivas?: SalaAtivaListItem[]
  /** Deep-link `?eventoId=` — abre o composer no modo evento. */
  eventoIdInicial?: string
}

function ComunicadosFallback() {
  return <div className="h-16 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
}

function AsideWidgetsFallback() {
  return (
    <>
      <div className="h-32 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
      <div className="h-40 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
    </>
  )
}

function ComposerFallback() {
  return (
    <div className="h-24 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
  )
}

export function ComunidadeFeedShell({
  tenant,
  currentUser,
  cursor,
  filtro = 'descobrir',
  clubeNacional = null,
  somentePublicoHint = false,
  salasAtivas = [],
  eventoIdInicial,
}: ComunidadeFeedShellProps) {
  return (
    <>
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-4">
          {currentUser.id ? (
            <Suspense
              fallback={
                <ComunidadeUserCardFallback
                  tenantNome={tenant.nome}
                  userName={currentUser.nome}
                  userAvatar={currentUser.avatarUrl}
                />
              }
            >
              <ComunidadeUserCardSection
                tenantId={tenant.id}
                tenantNome={tenant.nome}
                userId={currentUser.id}
                userName={currentUser.nome}
                userAvatar={currentUser.avatarUrl}
              />
            </Suspense>
          ) : null}

          {currentUser.id ? (
            <Suspense fallback={<ComunidadeFeedNavFallback />}>
              <ComunidadeFeedNav
                tenantId={tenant.id}
                userId={currentUser.id}
                currentUserId={currentUser.id}
                mostrarBalanco={tenant.balancoFinanceiroVisivel === true}
              />
            </Suspense>
          ) : null}

          <Suspense fallback={<AsideWidgetsFallback />}>
            <ComunidadeAsideWidgets
              tenantId={tenant.id}
              afiliacaoId={tenant.afiliacaoId}
              currentUserId={currentUser.id || undefined}
              salasAoVivo={salasAtivas}
            />
          </Suspense>
        </div>
      </aside>

      <main className="min-w-0 space-y-4">
        {clubeNacional && somentePublicoHint && (
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))]">
            Feed da comunidade nacional de{' '}
            <strong className="text-[rgb(var(--foreground))]">
              {clubeNacional.apelido || clubeNacional.nome}
            </strong>
            . Publicações públicas das torcidas do clube na plataforma.
          </div>
        )}

        <ComunidadeStickySearchChrome />

        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
          {[
            { href: '/portal/comunidade/salas', label: 'Salas', icon: Video },
            { href: '/portal/comunidade/rede', label: 'Minha rede', icon: Heart },
            { href: '/portal/comunidade/grupos', label: 'Grupos', icon: Users },
            { href: '/portal/comunidade/canais', label: 'Canais', icon: Radio },
            { href: '/portal/comunidade/classificacao', label: 'Classificação', icon: ListOrdered },
            ...(tenant.balancoFinanceiroVisivel
              ? [{ href: '/portal/balanco', label: 'Balanço', icon: Scale }]
              : []),
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
          <ComunidadeSalasMobile salas={salasAtivas} />
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
          <Suspense fallback={<ComposerFallback />}>
            <ComunidadeComposerSection
              tenantId={tenant.id}
              userId={currentUser.id}
              userName={currentUser.nome}
              userAvatar={currentUser.avatarUrl}
              eventoIdInicial={eventoIdInicial}
            />
          </Suspense>
        )}

        <Suspense fallback={<ComunicadosFallback />}>
          <ComunidadeComunicadosSection tenantId={tenant.id} currentUserId={currentUser.id} />
        </Suspense>

        <FeedLiveBanner filtro={filtro} />

        <Suspense
          fallback={
            <ComunidadeFeedBootstrap
              tenantId={tenant.id}
              currentUser={currentUser}
              filtro={filtro}
              cursor={cursor ?? null}
            />
          }
        >
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
