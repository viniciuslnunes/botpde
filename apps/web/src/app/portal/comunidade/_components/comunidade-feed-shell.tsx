import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { Video, Users, Heart, Bookmark, UserPlus, Radio } from 'lucide-react'
import { Avatar } from '@/components/portal/avatar'
import { ComunidadeSalasMobile } from './comunidade-salas-mobile'
import { ComunidadeComunicadosSection } from './comunidade-comunicados-section'
import { ComunidadePostsSection } from './comunidade-posts-section'
import { ComunidadeAsideWidgets } from './comunidade-aside-widgets'
import { ComunidadeStoriesSection } from './comunidade-stories-section'
import { ComunidadeStickySearchChrome } from './comunidade-sticky-search-chrome'
import { FeedLiveBanner } from './feed-live-banner'
import { ComunidadeFeedNav, ComunidadeFeedNavFallback } from './comunidade-feed-nav'
import type { SalaAtivaListItem } from '@/lib/salas'

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

interface UserCardInfo {
  numeroSocio: number | null
  numeroAssociado: string | null
  tipo: 'SOCIO' | 'TORCEDOR' | null
  departamentos: string[]
}

interface ComunidadeFeedShellProps {
  tenant: { id: string; nome: string; afiliacaoId: string | null }
  currentUser: CurrentUser
  userCard?: UserCardInfo
  cursor?: string
  perfilPrivado?: boolean
  /** `data` em ISO — serializado na page antes de cruzar para o FeedComposer (client). */
  eventosComposer?: import('@/lib/eventos').EventoComposerItem[]
  bloqueioPublicacao?: string | null
  somentePublico?: boolean
  filtro?: 'descobrir' | 'seguindo'
  /** Clube do torcedor global (banner quando feed usa tenant proxy). */
  clubeNacional?: { id: string; nome: string; apelido: string | null } | null
  /** Slug do clube (Afiliacao) para widgets Sofascore contextualizados. */
  afiliacaoSlug?: string | null
  /** COMMUNITY_POST_NACIONAL — libera "Torcida e torcedores" no composer. */
  podePublicarNacional?: boolean
  salasAtivas?: SalaAtivaListItem[]
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
  userCard = { numeroSocio: null, numeroAssociado: null, tipo: null, departamentos: [] },
  cursor,
  perfilPrivado = false,
  eventosComposer = [],
  bloqueioPublicacao = null,
  somentePublico = false,
  filtro = 'descobrir',
  clubeNacional = null,
  afiliacaoSlug = null,
  podePublicarNacional = false,
  salasAtivas = [],
}: ComunidadeFeedShellProps) {
  const numeroExibido =
    userCard.numeroSocio != null
      ? String(userCard.numeroSocio).padStart(5, '0')
      : userCard.numeroAssociado?.trim() || null
  const departamentosLabel =
    userCard.departamentos.length > 0 ? userCard.departamentos.join(' · ') : null

  return (
    <>
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-4">
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
            <Link
              href={
                currentUser.id
                  ? `/portal/comunidade/perfil/${currentUser.id}`
                  : '/portal/comunidade'
              }
              className="flex items-start gap-3 rounded-xl outline-offset-2 transition-opacity hover:opacity-90"
            >
              <Avatar nome={currentUser.nome} avatarUrl={currentUser.avatarUrl} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                  {currentUser.nome ?? 'Torcedor'}
                </p>
                <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">{tenant.nome}</p>
                {(numeroExibido || departamentosLabel) && (
                  <div className="mt-1.5 space-y-0.5">
                    {numeroExibido && (
                      <p className="truncate text-[11px] font-medium tabular-nums text-[rgb(var(--foreground-muted))]">
                        Nº {numeroExibido}
                        {userCard.tipo === 'SOCIO' ? ' · Sócio' : ''}
                      </p>
                    )}
                    {departamentosLabel && (
                      <p className="truncate text-[11px] text-[rgb(var(--primary))]">
                        {departamentosLabel}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Link>
          </div>

          {currentUser.id ? (
            <Suspense fallback={<ComunidadeFeedNavFallback />}>
              <ComunidadeFeedNav
                tenantId={tenant.id}
                userId={currentUser.id}
                currentUserId={currentUser.id}
              />
            </Suspense>
          ) : null}

          <Suspense fallback={<AsideWidgetsFallback />}>
            <ComunidadeAsideWidgets
              tenantId={tenant.id}
              afiliacaoId={tenant.afiliacaoId}
              afiliacaoSlug={afiliacaoSlug}
              currentUserId={currentUser.id || undefined}
              salasAoVivo={salasAtivas}
            />
          </Suspense>
        </div>
      </aside>

      <main className="min-w-0 space-y-4">
        {clubeNacional && somentePublico && (
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
          <FeedComposer
            userName={currentUser.nome}
            userAvatar={currentUser.avatarUrl}
            perfilPrivado={perfilPrivado}
            eventos={eventosComposer}
            bloqueioPublicacao={bloqueioPublicacao}
            somentePublico={somentePublico}
            podePublicarNacional={podePublicarNacional}
          />
        )}

        <Suspense fallback={<ComunicadosFallback />}>
          <ComunidadeComunicadosSection tenantId={tenant.id} currentUserId={currentUser.id} />
        </Suspense>

        <FeedLiveBanner filtro={filtro} />

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
