import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getEstadoOnboarding } from '@/lib/onboarding'
import { PortalNavbar } from '@/components/portal/navbar'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/entrar')
  }

  // Gate de onboarding: quem ainda não concluiu e não tem vínculo é direcionado
  // ao hub. Membros existentes (temMembro) e quem já concluiu são poupados
  // (grandfather). O /onboarding tem layout próprio, fora do portal → sem loop.
  const estado = await getEstadoOnboarding(session.user.id)
  if (!estado.perfil?.onboardingConcluidoEm && !estado.temMembro) {
    redirect('/onboarding')
  }

  const tenant = await getTenantFromHost()

  return (
    <div className="min-h-screen bg-[rgb(var(--background-subtle))]">
      <PortalNavbar
        userName={session.user.name ?? null}
        userAvatar={session.user.image ?? null}
        tenantNome={tenant?.nome ?? 'Torcida'}
        tenantCor={tenant?.corPrimaria ?? '#7c3aed'}
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
