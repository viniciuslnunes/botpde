import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getActiveTenant } from '@/lib/tenant'
import { getEstadoOnboarding } from '@/lib/onboarding'
import { PortalNavbar } from '@/components/portal/navbar'
import { PortalMotionShell } from '@/components/motion/portal-motion-shell'

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

  const tenant = await getActiveTenant(session.user.id, session.user.email)

  return (
    <div className="app-shell-bg min-h-screen">
      <PortalNavbar
        userName={session.user.name ?? null}
        userAvatar={session.user.image ?? null}
        tenantNome={tenant?.nome ?? 'Torcida'}
        tenantCor={tenant?.corPrimaria ?? '#7c3aed'}
      />
      <main className="app-container relative py-8">
        <PortalMotionShell>{children}</PortalMotionShell>
      </main>
    </div>
  )
}
