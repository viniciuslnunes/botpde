import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getEstadoOnboarding } from '@/lib/onboarding'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Bem-vindo' }

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  // Quem já concluiu (ou já é membro) não repete o onboarding.
  const estado = await getEstadoOnboarding(session.user.id)
  if (estado.perfil?.onboardingConcluidoEm || estado.temMembro) {
    redirect('/portal/comunidade')
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--background-subtle))]">
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  )
}
