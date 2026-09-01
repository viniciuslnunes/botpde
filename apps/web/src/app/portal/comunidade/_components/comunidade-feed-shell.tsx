import { Suspense, type ReactNode } from 'react'
import { Video, Users, Heart, Bookmark, UserPlus, Radio, ListOrdered, Scale, Clock } from 'lucide-react'
import { CanalFocoNavLink } from '../canais/canais-list-link'
import { ComunidadeSalasMobile } from './comunidade-salas-mobile'
import { ComunidadePostsSection } from './comunidade-posts-section'
import { ComunidadeFeedBootstrap } from './comunidade-feed-bootstrap'
import { ComunidadeAsideRail } from './comunidade-aside-rail'
import { ComunidadeStoriesSection } from './comunidade-stories-section'
import { ComunidadeStickySearchChrome } from './comunidade-sticky-search-chrome'
import { ComunidadeEscopoTabs } from './comunidade-escopo-tabs'
import { FeedLiveBanner } from './feed-live-banner'
import { ComunidadeComposerSection } from './comunidade-composer-section'
import { FeedComposerSkeleton, FeedStoriesSkeleton } from '@/components/portal/feed-skeletons'
import { ComunidadeNacionalComposerSection } from './comunidade-nacional-composer-section'
import { ComunidadeNacionalBanner } from './comunidade-nacional-banner'
import { ComunidadePracaFeedCards } from './praca-feed-cards'
import type { SalaAtivaListItem } from '@/lib/salas'
import type { AfiliacaoComunidade } from '@/lib/comunidade-contexto'
import type { EscopoComunidade, EscoposDisponiveis } from '@/lib/comunidade-escopo'
import type { SolicitacaoSocioPendente } from '@/lib/onboarding'
import type { CanalAbertoOperador } from '@/lib/operador-canais-abertos'
import type { CanalTematicoAberto } from '@/lib/socio-canais-abertos'

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
  filtro?: 'descobrir' | 'seguindo' | 'grupos' | 'canal'
  /** Clube do torcedor (banner da CN + hint). */
  clubeNacional?: {
    id: string
    nome: string
    apelido: string | null
    escudoUrl?: string | null
  } | null
  /** Contagem de torcidas do clube — metadado do banner Nacional. */
  torcidasNacionalCount?: number | null
  /** Banner CN — true enquanto o composer carrega o estado real. */
  somentePublicoHint?: boolean
  salasAtivas?: SalaAtivaListItem[]
  /** Deep-link `?eventoId=` — abre o composer no modo evento. */
  eventoIdInicial?: string
  /** Canal do escopo `unidade` (mural oficial da subsede/PDE). */
  conversaId?: string
  /**
   * Mural do escopo Sede/unidade (`CanalFeedView`). Recebe o chrome de busca
   * para encaixar abaixo do banner — mesma ordem do Nacional.
   */
  renderConteudoCanal?: (slots: { busca: ReactNode }) => ReactNode
  /** Escopo ativo (Nacional × Minha torcida × Minha unidade). */
  escopo?: EscopoComunidade
  escopos?: EscoposDisponiveis
  /** Rótulo da aba de unidade — nome da subsede/PDE de vínculo. */
  nomeUnidade?: string | null
  /** Escudo/foto da unidade — aba "Minha unidade". */
  logoUnidade?: string | null
  /** Default do usuário (sócio=torcida, TORCEDOR=nacional) — abas de escopo. */
  modoContexto?: 'nacional' | 'torcida'
  afiliacao?: AfiliacaoComunidade | null
  /** Sócio com torcida real — card/composer na aba Nacional usam cargo da torcida. */
  torcidaReal?: { id: string; nome: string; logoUrl?: string | null; slug?: string | null } | null
  /** Slug da Sede raiz — troca de sessão nas abas-escudo. */
  slugTorcida?: string | null
  /** Slug do tenant da unidade de vínculo. */
  slugUnidade?: string | null
  /** Cookie / tenant ativo da sessão. */
  atualSlug?: string | null
  /** Conversa id do mural oficial da Sede. */
  canalIdTorcida?: string | null
  /** Conversa id do mural da unidade fixa. */
  canalIdUnidade?: string | null
  /** Sócio com pedido de vínculo em análise — mostrado no escopo Nacional. */
  solicitacaoPendente?: SolicitacaoSocioPendente | null
  /** Super-admin: barra multi-canal com X. */
  superAdmin?: boolean
  canaisAbertos?: CanalAbertoOperador[]
  /** Sócio / visitados: canais abertos na barra 4+ (cookie separado). */
  canaisTematicosAbertos?: CanalTematicoAberto[]
  /** Ordem unificada da zona móvel (`o:slug` / `t:id`). */
  ordemBarraMovelInicial?: string[]
  /** Página `/canais/[id]` — destaca a aba por conversa id. */
  canalAtivoId?: string | null
}

function ComposerFallback() {
  return <FeedComposerSkeleton />
}

export function ComunidadeFeedShell({
  tenant,
  currentUser,
  cursor,
  filtro = 'descobrir',
  clubeNacional = null,
  torcidasNacionalCount = null,
  somentePublicoHint = false,
  salasAtivas = [],
  eventoIdInicial,
  conversaId,
  renderConteudoCanal,
  escopo = 'torcida',
  escopos = { torcida: false, unidade: false },
  nomeUnidade = null,
  logoUnidade = null,
  modoContexto = 'torcida',
  afiliacao = null,
  torcidaReal = null,
  slugTorcida = null,
  slugUnidade = null,
  atualSlug = null,
  canalIdTorcida = null,
  canalIdUnidade = null,
  solicitacaoPendente = null,
  superAdmin = false,
  canaisAbertos = [],
  canaisTematicosAbertos = [],
  ordemBarraMovelInicial = [],
  canalAtivoId = null,
}: ComunidadeFeedShellProps) {
  const modoNacional = escopo === 'nacional'
  const modoCanal = Boolean(renderConteudoCanal)
  const contextoComunidadeNome = modoNacional
    ? (clubeNacional?.apelido || clubeNacional?.nome || null)
    : tenant.nome
  // TORCEDOR default nacional: sem `?escopo=` ainda precisa preservar CN nas subrotas.
  const sufixoEscopo = escopo === modoContexto ? '' : `?escopo=${escopo}`

  const buscaChrome = (
    <ComunidadeStickySearchChrome
      escopo={escopo}
      modoContexto={modoContexto}
      ocultarFiltrosFeed={modoCanal}
    />
  )

  const navMobile = (
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
      ].map(({ href, label, icon: Icon }) => {
        const className =
          'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]'
        return (
          <CanalFocoNavLink key={href} href={href} className={className}>
            <Icon className="h-4 w-4" /> {label}
          </CanalFocoNavLink>
        )
      })}
    </nav>
  )

  const salasMobile = (
    <Suspense fallback={null}>
      <ComunidadeSalasMobile salas={salasAtivas} sufixoEscopo={sufixoEscopo} />
    </Suspense>
  )

  /** Busca + atalhos mobile — no mural de canal, encaixa abaixo do banner (ordem Nacional). */
  const chromeAposBanner = (
    <>
      {buscaChrome}
      {navMobile}
      {salasMobile}
    </>
  )

  return (
    <>
      <ComunidadeAsideRail
        tenant={tenant}
        currentUser={currentUser}
        escopo={escopo}
        torcidaReal={torcidaReal}
      />

      <main className="min-w-0 space-y-4">
        <ComunidadeEscopoTabs
          afiliacao={afiliacao}
          escopos={escopos}
          escopoAtivo={escopo}
          nomeUnidade={nomeUnidade}
          logoUnidade={logoUnidade}
          nomeTorcida={torcidaReal?.nome ?? null}
          logoTorcida={torcidaReal?.logoUrl ?? null}
          slugTorcida={slugTorcida ?? torcidaReal?.slug ?? null}
          slugUnidade={slugUnidade}
          atualSlug={atualSlug}
          canalIdTorcida={canalIdTorcida}
          canalIdUnidade={canalIdUnidade}
          modoContexto={modoContexto}
          superAdmin={superAdmin}
          canaisAbertos={canaisAbertos}
          canaisTematicosAbertos={canaisTematicosAbertos}
          ordemBarraMovelInicial={ordemBarraMovelInicial}
          canalAtivoId={canalAtivoId}
        />

        {modoNacional && clubeNacional && (
          <ComunidadeNacionalBanner
            nome={clubeNacional.nome}
            apelido={clubeNacional.apelido}
            escudoUrl={clubeNacional.escudoUrl ?? afiliacao?.escudoUrl ?? null}
            torcidasCount={torcidasNacionalCount}
          />
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

        {!modoCanal && (
          <>
            {buscaChrome}
            {navMobile}
            {salasMobile}
          </>
        )}

        {renderConteudoCanal?.({ busca: chromeAposBanner })}

        {!modoCanal && !modoNacional && currentUser.id && (
          <Suspense fallback={<FeedStoriesSkeleton />}>
            <ComunidadeStoriesSection tenantId={tenant.id} currentUser={currentUser} />
          </Suspense>
        )}

        {!modoCanal && (
          <div className={currentUser.id ? 'flex min-w-0 flex-col gap-6' : undefined}>
            {currentUser.id ? (
              <Suspense fallback={<ComposerFallback />}>
                {modoNacional ? (
                  /* Identidade pública do não-sócio é o clube ("TIMÃO"), não o nome
                     do tenant sintético ("… — Comunidade Nacional"). */
                  <ComunidadeNacionalComposerSection
                    tenantId={tenant.id}
                    tenantNome={clubeNacional?.apelido || clubeNacional?.nome || tenant.nome}
                    userId={currentUser.id}
                    userName={currentUser.nome}
                    userAvatar={currentUser.avatarUrl}
                    torcidaReal={torcidaReal}
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
            ) : null}

            <div className="flex min-w-0 flex-col gap-4">
              <FeedLiveBanner
                filtro={filtro}
                escopo={escopo}
                afiliacaoId={modoNacional ? tenant.afiliacaoId ?? undefined : undefined}
              />

              <Suspense fallback={null}>
                <ComunidadePracaFeedCards
                  escopo={escopo}
                  ancora={
                    modoNacional
                      ? { tenantId: null, afiliacaoId: tenant.afiliacaoId }
                      : { tenantId: tenant.id, afiliacaoId: tenant.afiliacaoId }
                  }
                />
              </Suspense>

              <Suspense
                fallback={
                  <ComunidadeFeedBootstrap
                    tenantId={tenant.id}
                    currentUser={currentUser}
                    filtro={filtro}
                    cursor={cursor ?? null}
                    escopo={escopo}
                    afiliacaoId={modoNacional ? tenant.afiliacaoId ?? undefined : undefined}
                    contextoComunidadeNome={contextoComunidadeNome}
                  />
                }
              >
                <ComunidadePostsSection
                  tenantId={tenant.id}
                  currentUser={currentUser}
                  cursor={cursor}
                  filtro={filtro}
                  conversaId={conversaId}
                  escopo={escopo}
                  afiliacaoId={modoNacional ? tenant.afiliacaoId : undefined}
                  podeCompartilhar={modoContexto === 'torcida'}
                  contextoComunidadeNome={contextoComunidadeNome}
                />
              </Suspense>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
