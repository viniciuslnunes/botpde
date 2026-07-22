import Link from 'next/link'
import { Suspense } from 'react'
import { Video, Users, Heart, Bookmark, UserPlus, Radio, ListOrdered, Scale, Clock } from 'lucide-react'
import { ComunidadeSalasMobile } from './comunidade-salas-mobile'
import { ComunidadeComunicadosSection } from './comunidade-comunicados-section'
import { ComunidadePostsSection } from './comunidade-posts-section'
import { ComunidadeFeedBootstrap } from './comunidade-feed-bootstrap'
import { ComunidadeAsideRail } from './comunidade-aside-rail'
import { ComunidadeStoriesSection } from './comunidade-stories-section'
import { ComunidadeStickySearchChrome } from './comunidade-sticky-search-chrome'
import { ComunidadeEscopoTabs } from './comunidade-escopo-tabs'
import { FeedLiveBanner } from './feed-live-banner'
import { ComunidadeComposerSection } from './comunidade-composer-section'
import { ComunidadeNacionalComposer } from './comunidade-nacional-composer'
import type { SalaAtivaListItem } from '@/lib/salas'
import type { AfiliacaoComunidade } from '@/lib/comunidade-contexto'
import type { SolicitacaoSocioPendente } from '@/lib/onboarding'

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
  /** Escopo ativo do feed dual (Nacional × Minha torcida). */
  escopo?: 'nacional' | 'torcida'
  podeEscopoTorcida?: boolean
  afiliacao?: AfiliacaoComunidade | null
  /** Sócio com pedido de vínculo em análise — mostrado no escopo Nacional. */
  solicitacaoPendente?: SolicitacaoSocioPendente | null
}

function ComunicadosFallback() {
  return <div className="h-16 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
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
  escopo = 'torcida',
  podeEscopoTorcida = false,
  afiliacao = null,
  solicitacaoPendente = null,
}: ComunidadeFeedShellProps) {
  const modoNacional = escopo === 'nacional'
  const sufixoEscopo = modoNacional ? '?escopo=nacional' : ''

  return (
    <>
      <ComunidadeAsideRail
        tenant={tenant}
        currentUser={currentUser}
        salasAtivas={salasAtivas}
        escopo={escopo}
      />

      <main className="min-w-0 space-y-4">
        <ComunidadeEscopoTabs
          afiliacao={afiliacao}
          podeEscopoTorcida={podeEscopoTorcida}
          escopoAtivo={escopo}
        />

        {modoNacional && (
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))]">
            Feed da comunidade nacional de{' '}
            <strong className="text-[rgb(var(--foreground))]">
              {clubeNacional?.apelido || clubeNacional?.nome}
            </strong>
            . Publicações públicas das torcidas do clube na plataforma.
          </div>
        )}

        {modoNacional && solicitacaoPendente && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <Clock className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">
              Sua solicitação de sócio na <strong>{solicitacaoPendente.tenantNome}</strong> está
              em análise pela diretoria. Você continua aqui, na Comunidade Nacional, até ser
              aprovado ou reprovado — a gente te avisa assim que houver uma decisão.
            </p>
          </div>
        )}

        {clubeNacional && !modoNacional && somentePublicoHint && (
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
            { href: `/portal/comunidade/salas${sufixoEscopo}`, label: 'Salas', icon: Video },
            ...(modoNacional
              ? []
              : [{ href: '/portal/comunidade/rede', label: 'Minha rede', icon: Heart }]),
            { href: `/portal/comunidade/grupos${sufixoEscopo}`, label: 'Grupos', icon: Users },
            { href: `/portal/comunidade/canais${sufixoEscopo}`, label: 'Canais', icon: Radio },
            { href: '/portal/comunidade/classificacao', label: 'Classificação', icon: ListOrdered },
            ...(tenant.balancoFinanceiroVisivel && !modoNacional
              ? [{ href: '/portal/balanco', label: 'Balanço', icon: Scale }]
              : []),
            ...(modoNacional
              ? []
              : [
                  { href: '/portal/comunidade/salvos', label: 'Salvos', icon: Bookmark },
                  { href: '/portal/comunidade/seguindo', label: 'Solicitações', icon: UserPlus },
                ]),
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

        {!modoNacional && currentUser.id && (
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
            {modoNacional ? (
              <ComunidadeNacionalComposer
                currentUser={currentUser}
                tenantId={tenant.id}
                tenantNome={tenant.nome}
              />
            ) : (
              <ComunidadeComposerSection
                tenantId={tenant.id}
                tenantNome={tenant.nome}
                userId={currentUser.id}
                userName={currentUser.nome}
                userAvatar={currentUser.avatarUrl}
                eventoIdInicial={eventoIdInicial}
              />
            )}
          </Suspense>
        )}

        {!modoNacional && (
          <Suspense fallback={<ComunicadosFallback />}>
            <ComunidadeComunicadosSection tenantId={tenant.id} currentUserId={currentUser.id} />
          </Suspense>
        )}

        <FeedLiveBanner filtro={filtro} escopo={escopo} />

        <Suspense
          fallback={
            <ComunidadeFeedBootstrap
              tenantId={tenant.id}
              currentUser={currentUser}
              filtro={filtro}
              cursor={cursor ?? null}
              escopo={escopo}
              afiliacaoId={modoNacional ? tenant.afiliacaoId ?? undefined : undefined}
            />
          }
        >
          <ComunidadePostsSection
            tenantId={tenant.id}
            currentUser={currentUser}
            cursor={cursor}
            filtro={filtro}
            escopo={escopo}
            afiliacaoId={modoNacional ? tenant.afiliacaoId : undefined}
          />
        </Suspense>
      </main>
    </>
  )
}
