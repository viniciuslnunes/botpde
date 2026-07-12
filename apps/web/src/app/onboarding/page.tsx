import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAfiliacoesParaOnboarding } from '@/lib/onboarding'
import { OnboardingWizard } from './wizard'

// Estados brasileiros para o passo de região.
const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

export default async function OnboardingPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const afiliacoesIniciais = await getAfiliacoesParaOnboarding()

  return (
    <OnboardingWizard
      afiliacoesIniciais={afiliacoesIniciais}
      ufs={UFS}
      nomeInicial={session.user.name ?? ''}
    />
  )
}
