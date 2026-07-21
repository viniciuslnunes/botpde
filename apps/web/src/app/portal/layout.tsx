import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { getEstadoOnboarding } from '@/lib/onboarding'
import {
  isSuperAdminEmail,
  listarVinculosAprovadosDoUsuario,
  usuarioPrecisaNickname,
} from '@/lib/tenant-context'
import { PortalNavbar } from '@/components/portal/navbar'
import { PortalMotionShell } from '@/components/motion/portal-motion-shell'
import { TenantDesignBridge } from '@/components/tenant-design-bridge'
import { getTenantFromHost } from '@/lib/tenant'

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

  // Design completo só no modo torcida (tenant real).
  const hostTenant = ctx?.modo === 'torcida' ? await getTenantFromHost() : null

  // Seletor de troca de torcida: só para quem tem vínculo aprovado em mais
  // de uma (super-admin não usa isso — ele já tem o switcher no admin).
  const vinculos = isSuperAdmin ? [] : await listarVinculosAprovadosDoUsuario(session.user.id)

  return (
    <div className="app-shell-bg min-h-screen">
      {hostTenant ? (
        <TenantDesignBridge corPrimaria={hostTenant.corPrimaria} design={hostTenant.design} />
      ) : null}
      <PortalNavbar
        userName={session.user.name ?? null}
        userAvatar={session.user.image ?? null}
        tenant={navbarTenant}
        temDepartamentos={totalDepartamentos > 0}
        modoNacional={ctx?.modo === 'nacional'}
        tenantSlugAtual={hostTenant?.slug ?? null}
        vinculos={vinculos}
      />
      <main className="app-container relative py-4 sm:py-8">
        <PortalMotionShell>{children}</PortalMotionShell>
      </main>
    </div>
  )
}
