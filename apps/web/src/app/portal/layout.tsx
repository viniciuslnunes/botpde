import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { getEstadoOnboarding } from '@/lib/onboarding'
import { isSuperAdminEmail, usuarioPrecisaNickname } from '@/lib/tenant-context'
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

  const isSuperAdmin = isSuperAdminEmail(session.user.email)

  // Operadores (super-admin) não precisam de @ nem passam pelo onboarding de
  // torcedor — mesma exceção já aplicada em admin/layout.tsx.
  if (!isSuperAdmin && (await usuarioPrecisaNickname(session.user.id))) {
    redirect('/definir-apelido')
  }

  // Gate de onboarding: quem ainda não concluiu e não tem vínculo é direcionado
  // ao hub. Membros existentes (temMembro) e quem já concluiu são poupados
  // (grandfather). O /onboarding tem layout próprio, fora do portal → sem loop.
  if (!isSuperAdmin) {
    const estado = await getEstadoOnboarding(session.user.id)
    if (!estado.perfil?.onboardingConcluidoEm && !estado.temMembro) {
      redirect('/onboarding')
    }
  }

  // Contexto pode ser torcida ativa ou comunidade nacional (torcedor global).
  const ctx = await resolverContextoComunidade(session.user.id, session.user.email)

  // Link agregado "Departamentos" na navbar — hub de áreas (atuação + visão Diretoria).
  // Áreas → /portal/departamentos → /portal/departamentos/[slug]
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
        modoNacional={ctx?.modo === 'nacional'}
      />
      <main className="app-container relative py-8">
        <PortalMotionShell>{children}</PortalMotionShell>
      </main>
    </div>
  )
}
