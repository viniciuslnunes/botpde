import { Suspense } from 'react'
import { ComunidadeAsideWidgets } from './comunidade-aside-widgets'
import { ComunidadeFeedNav, ComunidadeFeedNavFallback } from './comunidade-feed-nav'
import {
  ComunidadeUserCardSection,
  ComunidadeUserCardFallback,
} from './comunidade-user-card-section'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import { COMUNIDADE_RAIL_SCROLL } from './comunidade-rail-scroll'

interface CurrentUser {
  id: string
  nome: string | null
  avatarUrl: string | null
}

function AsideWidgetsFallback() {
  return (
    <>
      <div className="h-32 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
      <div className="h-40 animate-pulse rounded-2xl bg-[rgb(var(--border))]" />
    </>
  )
}

/**
 * Coluna esquerda do feed (card do sócio + nav + widgets) — extraída de
 * `ComunidadeFeedShell` para ser reutilizada também na visão de canal
 * (`/canais/[id]`), que precisa ficar visualmente idêntica ao feed principal.
 */
export function ComunidadeAsideRail({
  tenant,
  currentUser,
  escopo = 'torcida',
  torcidaReal = null,
}: {
  tenant: { id: string; nome: string; afiliacaoId: string | null; balancoFinanceiroVisivel?: boolean }
  currentUser: CurrentUser
  /** Feed dual (Nacional × Minha torcida) — ajusta card do sócio e links da nav. */
  escopo?: EscopoComunidade
  /** Torcida real do sócio — na aba Nacional exibe cargo em vez do rótulo da CN. */
  torcidaReal?: { id: string; nome: string } | null
}) {
  if (!currentUser.id) return null

  const modoNacional = escopo === 'nacional'
  const cardTenantId = modoNacional && torcidaReal ? torcidaReal.id : tenant.id
  const cardTenantNome = modoNacional && torcidaReal ? torcidaReal.nome : tenant.nome

  return (
    <aside className="hidden lg:block">
      <div className={COMUNIDADE_RAIL_SCROLL}>
        {modoNacional && !torcidaReal ? (
          <ComunidadeUserCardFallback
            tenantNome={tenant.nome}
            userName={currentUser.nome}
            userAvatar={currentUser.avatarUrl}
          />
        ) : (
          <Suspense
            fallback={
              <ComunidadeUserCardFallback
                tenantNome={cardTenantNome}
                userName={currentUser.nome}
                userAvatar={currentUser.avatarUrl}
              />
            }
          >
            <ComunidadeUserCardSection
              tenantId={cardTenantId}
              tenantNome={cardTenantNome}
              userId={currentUser.id}
              userName={currentUser.nome}
              userAvatar={currentUser.avatarUrl}
            />
          </Suspense>
        )}

        <Suspense fallback={<ComunidadeFeedNavFallback />}>
          <ComunidadeFeedNav
            tenantId={tenant.id}
            userId={currentUser.id}
            currentUserId={currentUser.id}
            mostrarBalanco={tenant.balancoFinanceiroVisivel === true}
            escopo={escopo}
          />
        </Suspense>

        <Suspense fallback={<AsideWidgetsFallback />}>
          <ComunidadeAsideWidgets
            tenantId={tenant.id}
            afiliacaoId={tenant.afiliacaoId}
            currentUserId={currentUser.id}
            escopo={escopo}
          />
        </Suspense>
      </div>
    </aside>
  )
}
