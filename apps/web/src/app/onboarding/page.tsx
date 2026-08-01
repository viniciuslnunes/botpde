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
import { OnboardingSkeleton } from './onboarding-skeleton'
import { OnboardingWizard } from './wizard'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ convite?: string }>
}) {
  const { convite: conviteNaUrl } = await searchParams
  const slugUrl = isConviteSlugShape(conviteNaUrl) ? conviteNaUrl : null
  const slugCookie = slugUrl ? null : await lerSlugConviteDoCookie()
  const conviteSlug = slugUrl ?? slugCookie

  // Cookie sozinho → canônica na URL (refresh/histórico mantêm o contexto).
  if (!slugUrl && conviteSlug) {
    redirect(`/onboarding?convite=${encodeURIComponent(conviteSlug)}`)
  }

  const session = await auth()
  if (!session?.user?.id) {
    redirect(
      conviteSlug
        ? `/entrar?callbackUrl=${encodeURIComponent(`/convite/${conviteSlug}`)}`
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

  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <OnboardingWizardLoader
        nomeInicial={session.user.name ?? ''}
        emailInicial={session.user.email ?? ''}
        userId={userId}
        conviteSlug={conviteSlug}
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
}: {
  nomeInicial: string
  emailInicial: string
  userId: string
  conviteSlug: string | null
}) {
  const [afiliacoesIniciais, regioes, convite] = await Promise.all([
    getAfiliacoesParaOnboarding(),
    getRegioesOnboarding(),
    conviteSlug ? resolverConvite(conviteSlug) : Promise.resolve(null),
  ])

  return (
    <OnboardingWizard
      afiliacoesIniciais={afiliacoesIniciais}
      regioes={regioes}
      nomeInicial={nomeInicial}
      emailInicial={emailInicial}
      userId={userId}
      convite={convite}
    />
  )
}
