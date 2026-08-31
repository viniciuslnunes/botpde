import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@torcida/db'
import { getAfiliacoesParaOnboarding, getEstadoOnboarding, getRegioesOnboarding } from '@/lib/onboarding'
import { getTenantFromHost } from '@/lib/tenant'
import { usuarioPrecisaNickname } from '@/lib/tenant-context'
import { resolverConvite } from '@/lib/convite'
import { isConviteSlugShape } from '@/lib/convite-cookie'
import { lerSlugConviteDoCookie } from '@/lib/convite-cookie-server'
import { resolverDeepLinkAssocieSe } from '@/lib/associe-se'
import type { AfiliacaoOnboarding } from '@/lib/onboarding'
import { OnboardingSkeleton } from './onboarding-skeleton'
import { OnboardingWizard, type AssocieSeOnboarding } from './wizard'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const STATS_CLUBE_VAZIAS = {
  sociosTotal: 0,
  sociosOnline: 0,
  torcedoresTotal: 0,
  torcedoresOnline: 0,
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ convite?: string; origem?: string; torcida?: string; sede?: string }>
}) {
  const {
    convite: conviteNaUrl,
    origem,
    torcida: torcidaParam,
    sede: sedeParam,
  } = await searchParams
  const slugUrl = isConviteSlugShape(conviteNaUrl) ? conviteNaUrl : null
  const slugCookie = slugUrl ? null : await lerSlugConviteDoCookie()
  const conviteSlug = slugUrl ?? slugCookie
  const origemAssocieSe = origem === 'associe-se' && !conviteSlug
  const torcidaId = torcidaParam && UUID_RE.test(torcidaParam) ? torcidaParam : null
  const sedeId = sedeParam && UUID_RE.test(sedeParam) ? sedeParam : null

  // Cookie sozinho → canônica na URL (refresh/histórico mantêm o contexto).
  if (!slugUrl && conviteSlug) {
    redirect(`/onboarding?convite=${encodeURIComponent(conviteSlug)}`)
  }

  const session = await auth()
  if (!session?.user?.id) {
    redirect(
      conviteSlug
        ? `/entrar?callbackUrl=${encodeURIComponent(`/convite/${conviteSlug}`)}`
        : origemAssocieSe
          ? `/entrar?callbackUrl=${encodeURIComponent('/portal/associe-se')}`
          : '/entrar',
    )
  }

  const userId = session.user.id

  // Gates em paralelo — evita waterfall de 3 RTTs antes do catálogo.
  const [precisaNickname, estado, hostTenant] = await Promise.all([
    usuarioPrecisaNickname(userId),
    getEstadoOnboarding(userId),
    getTenantFromHost(),
  ])

  if (precisaNickname) {
    // Convite não pula a identidade: volta para cá depois do @ e do e-mail.
    redirect(
      conviteSlug
        ? `/definir-apelido?callbackUrl=${encodeURIComponent(`/convite/${conviteSlug}`)}`
        : '/definir-apelido',
    )
  }

  if (!origemAssocieSe) {
    if (hostTenant) {
      const membroHost = await db.saasMembro.findUnique({
        where: { tenantId_userId: { tenantId: hostTenant.id, userId } },
        select: { status: true },
      })
      if (membroHost?.status === 'APROVADO') {
        redirect('/auth/contexto')
      }
    } else if (estado.perfil?.onboardingConcluidoEm && estado.temMembro) {
      redirect('/auth/contexto')
    }
  }

  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <OnboardingWizardLoader
        nomeInicial={session.user.name ?? ''}
        emailInicial={session.user.email ?? ''}
        userId={userId}
        conviteSlug={conviteSlug}
        origemAssocieSe={origemAssocieSe}
        torcidaId={torcidaId}
        sedeId={sedeId}
      />
    </Suspense>
  )
}

/** Catálogo pesado em Suspense — shell/gates resolvem antes; skeleton cobre o fetch. */
async function OnboardingWizardLoader({
  nomeInicial,
  emailInicial,
  userId,
  conviteSlug,
  origemAssocieSe,
  torcidaId,
  sedeId,
}: {
  nomeInicial: string
  emailInicial: string
  userId: string
  conviteSlug: string | null
  origemAssocieSe: boolean
  torcidaId: string | null
  sedeId: string | null
}) {
  const [afiliacoesIniciais, regioes, convite, associeSe] = await Promise.all([
    getAfiliacoesParaOnboarding(),
    getRegioesOnboarding(),
    conviteSlug ? resolverConvite(conviteSlug) : Promise.resolve(null),
    origemAssocieSe && torcidaId
      ? resolverDeepLinkAssocieSe(userId, torcidaId, sedeId)
      : Promise.resolve(null),
  ])

  if (origemAssocieSe && (!associeSe || associeSe.ok !== true)) {
    redirect('/portal/associe-se')
  }

  let associeSeProps: AssocieSeOnboarding | null = null
  if (associeSe && associeSe.ok === true) {
    const clubeCatalogo = afiliacoesIniciais.find((a) => a.id === associeSe.dados.clubeId)
    const clube: AfiliacaoOnboarding = clubeCatalogo ?? {
      id: associeSe.dados.clubeId,
      nome: associeSe.dados.torcida.nome,
      apelido: null,
      escudoUrl: null,
      cidade: associeSe.dados.cidade || null,
      estado: associeSe.dados.uf || null,
      serie: null,
      torcedoresEstimados: null,
      torcedoresEstimadosFonte: null,
      torcedoresEstimadosTipo: null,
      stats: STATS_CLUBE_VAZIAS,
    }
    associeSeProps = {
      clube,
      torcida: associeSe.dados.torcida,
      unidadeId: associeSe.dados.unidadeId,
      uf: associeSe.dados.uf,
      cidade: associeSe.dados.cidade,
    }
  }

  return (
    <OnboardingWizard
      afiliacoesIniciais={afiliacoesIniciais}
      regioes={regioes}
      nomeInicial={nomeInicial}
      emailInicial={emailInicial}
      userId={userId}
      convite={convite}
      associeSe={associeSeProps}
    />
  )
}
