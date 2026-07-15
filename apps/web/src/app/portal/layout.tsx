import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
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

  // Contexto pode ser torcida ativa ou comunidade nacional (torcedor global).
  const ctx = await resolverContextoComunidade(session.user.id, session.user.email)

  // Link "Departamentos" na navbar só aparece para quem atua em ≥1 departamento
  const totalDepartamentos: number =
    ctx?.modo === 'torcida'
      ? await db.userDepartamento.count({
          where: { userId: session.user.id, tenantId: ctx.tenant.id },
        })
      : 0

  const navbarTenant =
    ctx?.modo === 'torcida'
      ? { nome: ctx.tenant.nome, corPrimaria: ctx.tenant.corPrimaria, logoUrl: ctx.tenant.logoUrl }
      : ctx?.modo === 'nacional'
        ? {
            nome: ctx.afiliacao.apelido ?? ctx.afiliacao.nome,
            corPrimaria: '#7c3aed',
            logoUrl: ctx.afiliacao.escudoUrl,
          }
        : { nome: 'Torcida', corPrimaria: '#7c3aed', logoUrl: null }

  return (
    <div className="app-shell-bg min-h-screen">
      <PortalNavbar
        userName={session.user.name ?? null}
        userAvatar={session.user.image ?? null}
        tenant={navbarTenant}
        temDepartamentos={totalDepartamentos > 0}
      />
      <main className="app-container relative py-8">
        <PortalMotionShell>{children}</PortalMotionShell>
      </main>
    </div>
  )
}
