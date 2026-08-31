'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { CanaisListLink } from '../canais/canais-list-link'
import { FeedComposer } from '@/components/portal/feed-composer'
import { FeedPostSkeletonList } from '@/components/portal/feed-skeletons'
import { linkCanalComunidade } from '@/lib/canais-shared'
import {
  prefetchComunidadeFeedPage,
} from '@/lib/use-comunidade-infinite-feed'
import type { PostSocialItem } from '@/lib/feed'
import {
  carregarCanalMuralAction,
  registrarCanalVisitadoAction,
  type CanalMuralChrome,
} from '@/app/portal/comunidade/socio-canais-actions'
import { ComunidadeFeedInfinite } from './comunidade-feed-infinite'
import { CanalFeedComposition } from '../canais/[id]/canal-feed-composition'
import { ComunidadeQueryProvider } from '@/components/portal/comunidade-query-provider'

const FEED_ENDPOINT = '/api/comunidade/feed'

type CurrentUser = {
  id: string
  nome: string | null
  avatarUrl: string | null
}

export type CanalSoftSwitchSeed = {
  chrome: CanalMuralChrome
  currentUser: CurrentUser
  viewerTenantId: string
  tenantNome: string
  composerNome: string | null
  composerPerfilPrivado: boolean
  salvoIds: string[]
  initialPosts: PostSocialItem[]
  initialPageInfo: { hasMore: boolean; nextCursor: string | null }
  seedCanalId: string
}

type SoftSwitchContextValue = {
  enabled: true
  canalAtivoId: string
  /** Resolve quando o canal já está no ar — dá pra envolver numa transition. */
  softSwitchPara: (id: string) => Promise<void>
  prefetchCanal: (id: string) => void
}

const CanalSoftSwitchContext = createContext<SoftSwitchContextValue | null>(null)

export function useCanalSoftSwitch(): SoftSwitchContextValue | null {
  return useContext(CanalSoftSwitchContext)
}

function idDaUrlCanais(pathname: string): string | null {
  const m = pathname.match(/^\/portal\/comunidade\/canais\/([^/]+)\/?$/)
  return m?.[1] ?? null
}

export function CanalSoftSwitchProvider({
  seed,
  children,
}: {
  seed: CanalSoftSwitchSeed
  children: ReactNode
}) {
  return (
    <ComunidadeQueryProvider>
      <CanalSoftSwitchProviderView seed={seed}>{children}</CanalSoftSwitchProviderView>
    </ComunidadeQueryProvider>
  )
}

function CanalSoftSwitchProviderView({
  seed,
  children,
}: {
  seed: CanalSoftSwitchSeed
  children: ReactNode
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [activeCanalId, setActiveCanalId] = useState(seed.chrome.canal.id)
  const [chrome, setChrome] = useState(seed.chrome)
  const chromeCache = useRef(new Map<string, CanalMuralChrome>([[seed.chrome.canal.id, seed.chrome]]))
  const switchGen = useRef(0)

  const prefetchCanal = useCallback(
    (id: string) => {
      void prefetchComunidadeFeedPage({
        queryClient,
        endpoint: FEED_ENDPOINT,
        tenantId: seed.viewerTenantId,
        viewerId: seed.currentUser.id,
        filtro: 'canal',
        conversaId: id,
        escopo: 'torcida',
      })
    },
    [queryClient, seed.viewerTenantId, seed.currentUser.id],
  )

  const carregarChrome = useCallback(
    async (id: string, gen: number) => {
      const cached = chromeCache.current.get(id)
      if (cached) {
        if (gen === switchGen.current) setChrome(cached)
        return
      }
      try {
        const next = await carregarCanalMuralAction(id)
        chromeCache.current.set(id, next)
        if (gen === switchGen.current) setChrome(next)
      } catch {
        if (gen === switchGen.current) {
          router.push(linkCanalComunidade(id))
        }
      }
    },
    [router],
  )

  const softSwitchPara = useCallback(
    async (id: string) => {
      const limpo = id.trim()
      if (!limpo || limpo === activeCanalId) return

      const { trocouTenant } = await registrarCanalVisitadoAction(limpo)
      // Oficial de outra unidade: remount RSC com cookie de tenant novo.
      if (trocouTenant) {
        router.push(linkCanalComunidade(limpo))
        return
      }

      const gen = ++switchGen.current
      setActiveCanalId(limpo)
      window.history.pushState(null, '', linkCanalComunidade(limpo))
      prefetchCanal(limpo)

      const cached = chromeCache.current.get(limpo)
      if (cached) {
        setChrome(cached)
      } else {
        await carregarChrome(limpo, gen)
      }
    },
    [activeCanalId, carregarChrome, prefetchCanal, router],
  )

  useEffect(() => {
    function onPopState() {
      const id = idDaUrlCanais(window.location.pathname)
      if (!id) {
        router.replace(window.location.pathname + window.location.search)
        return
      }
      if (id === activeCanalId) return
      const gen = ++switchGen.current
      setActiveCanalId(id)
      prefetchCanal(id)
      const cached = chromeCache.current.get(id)
      if (cached) {
        setChrome(cached)
      } else {
        void carregarChrome(id, gen)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [activeCanalId, carregarChrome, prefetchCanal, router])

  const value = useMemo<SoftSwitchContextValue>(
    () => ({
      enabled: true,
      canalAtivoId: activeCanalId,
      softSwitchPara,
      prefetchCanal,
    }),
    [activeCanalId, softSwitchPara, prefetchCanal],
  )

  return (
    <CanalSoftSwitchContext.Provider value={value}>
      <CanalSoftSwitchInner seed={seed} chrome={chrome} activeCanalId={activeCanalId}>
        {children}
      </CanalSoftSwitchInner>
    </CanalSoftSwitchContext.Provider>
  )
}

/**
 * Expõe chrome/active para o mural via context interno — o Provider passa
 * children (shell) e o mural lê o mesmo context.
 */
const MuralStateContext = createContext<{
  seed: CanalSoftSwitchSeed
  chrome: CanalMuralChrome
  activeCanalId: string
} | null>(null)

function CanalSoftSwitchInner({
  seed,
  chrome,
  activeCanalId,
  children,
}: {
  seed: CanalSoftSwitchSeed
  chrome: CanalMuralChrome
  activeCanalId: string
  children: ReactNode
}) {
  const mural = useMemo(
    () => ({ seed, chrome, activeCanalId }),
    [seed, chrome, activeCanalId],
  )
  return (
    <MuralStateContext.Provider value={mural}>{children}</MuralStateContext.Provider>
  )
}

export function CanalSoftMuralHost({ buscaChrome }: { buscaChrome?: ReactNode }) {
  const mural = useContext(MuralStateContext)
  if (!mural) {
    throw new Error('CanalSoftMuralHost fora de CanalSoftSwitchProvider')
  }
  const { seed, chrome, activeCanalId } = mural
  const seedMatch = chrome.canal.id === seed.seedCanalId
  const verMural = chrome.canal.souMembro
  const chromePendente = chrome.canal.id !== activeCanalId

  return (
    <div className="space-y-4">
      <CanaisListLink
        href="/portal/comunidade/canais"
        className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1.5 pl-2 pr-3.5 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar aos canais
      </CanaisListLink>

      <CanalFeedComposition
        key={chrome.canal.id}
        canal={chrome.canal}
        currentUser={seed.currentUser}
        podePublicar={chrome.podePublicar}
        corPrimaria={chrome.corPrimaria}
        podeGerenciarAdmins={chrome.podeGerenciarAdmins}
        podeGerenciarMembros={chrome.podeGerenciarMembros}
        pedidosPendentesCount={chrome.pedidosPendentesCount}
        podeGerenciarPedidos={chrome.podeGerenciarPedidos}
        buscaChrome={buscaChrome}
        composer={
          chrome.podePublicar ? (
            <FeedComposer
              userId={seed.currentUser.id}
              userName={seed.composerNome}
              userAvatar={seed.currentUser.avatarUrl}
              tenantId={seed.viewerTenantId}
              tenantNome={seed.tenantNome}
              perfilPrivado={seed.composerPerfilPrivado}
              bloqueioPublicacao={null}
              canal={{
                conversaId: chrome.canal.id,
                nome: chrome.canal.nome ?? chrome.canal.tenantNome,
              }}
            />
          ) : null
        }
      >
        {chromePendente ? (
          <div role="status" aria-live="polite" aria-busy>
            <FeedPostSkeletonList count={3} />
          </div>
        ) : verMural ? (
          <ComunidadeFeedInfinite
            key={chrome.canal.id}
            tenantId={seed.viewerTenantId}
            currentUser={seed.currentUser}
            filtro="canal"
            conversaId={chrome.canal.id}
            escopo="torcida"
            initialPosts={seedMatch ? seed.initialPosts : []}
            initialPageInfo={
              seedMatch ? seed.initialPageInfo : { hasMore: false, nextCursor: null }
            }
            initialCursor={null}
            salvoIds={seed.salvoIds}
            seedFromSsr={seedMatch && seed.initialPosts.length > 0}
            podeCompartilhar={chrome.podeCompartilhar}
          />
        ) : null}
      </CanalFeedComposition>
    </div>
  )
}
