import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@torcida/db'
import { getAfiliacoesParaOnboarding, getEstadoOnboarding, getRegioesOnboarding } from '@/lib/onboarding'
import { getTenantFromHost } from '@/lib/tenant'
import { OnboardingWizard } from './wizard'

// Estados brasileiros para o passo de região.
const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

export default async function OnboardingPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const [estado, hostTenant] = await Promise.all([
    getEstadoOnboarding(session.user.id),
    getTenantFromHost(),
  ])

  if (hostTenant) {
    const membroHost = await db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId: hostTenant.id, userId: session.user.id } },
      select: { status: true },
    })
    if (membroHost?.status === 'APROVADO') {
      redirect('/auth/contexto')
    }
  } else if (estado.perfil?.onboardingConcluidoEm && estado.temMembro) {
    redirect('/auth/contexto')
  }

  const [afiliacoesIniciais, regioes] = await Promise.all([
    getAfiliacoesParaOnboarding(),
    getRegioesOnboarding(),
  ])

  return (
    <OnboardingWizard
      afiliacoesIniciais={afiliacoesIniciais}
      regioes={regioes}
      ufs={UFS}
      nomeInicial={session.user.name ?? ''}
    />
  )
}
