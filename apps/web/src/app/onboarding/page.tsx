import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@torcida/db'
import { getAfiliacoesParaOnboarding, getEstadoOnboarding, getRegioesOnboarding } from '@/lib/onboarding'
import { getTenantFromHost } from '@/lib/tenant'
import { usuarioPrecisaNickname } from '@/lib/tenant-context'
import { OnboardingSkeleton } from './onboarding-skeleton'
import { OnboardingWizard } from './wizard'

export default async function OnboardingPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const userId = session.user.id

  // Gates em paralelo — evita waterfall de 3 RTTs antes do catálogo.
  const [precisaNickname, estado, hostTenant] = await Promise.all([
    usuarioPrecisaNickname(userId),
    getEstadoOnboarding(userId),
    getTenantFromHost(),
  ])

  if (precisaNickname) {
    redirect('/definir-apelido')
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
      />
    </Suspense>
  )
}

/** Catálogo pesado em Suspense — shell/gates resolvem antes; skeleton cobre o fetch. */
async function OnboardingWizardLoader({
  nomeInicial,
  emailInicial,
  userId,
}: {
  nomeInicial: string
  emailInicial: string
  userId: string
}) {
  const [afiliacoesIniciais, regioes] = await Promise.all([
    getAfiliacoesParaOnboarding(),
    getRegioesOnboarding(),
  ])

  return (
    <OnboardingWizard
      afiliacoesIniciais={afiliacoesIniciais}
      regioes={regioes}
      nomeInicial={nomeInicial}
      emailInicial={emailInicial}
      userId={userId}
    />
  )
}
