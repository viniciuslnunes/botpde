import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { getAvatarAtualDoUsuario, getNomeAtualDoUsuario } from '@/lib/perfil-social'
import { getEstadoOnboarding } from '@/lib/onboarding'
import { Suspense } from 'react'
import { isSuperAdminEmail, usuarioPrecisaNickname } from '@/lib/tenant-context'
import { PortalNavbar } from '@/components/portal/navbar'
import { PortalMotionShell } from '@/components/motion/portal-motion-shell'
import { TenantDesignBridge } from '@/components/tenant-design-bridge'
import { getTenantFromHost } from '@/lib/tenant'
import { NavbarBrandOverrideProvider } from '@/lib/navbar-brand-override'
import { COR_PRIMARIA_PLATAFORMA } from '@torcida/types'

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

  // Modo nacional (torcedor global sem tenant real) herda a cor/design do
  // tenant sintético da Comunidade Nacional do clube em vez do roxo de fábrica.
  const corNacional = ctx?.modo === 'nacional' ? (ctx.tenantSintetico?.corPrimaria ?? COR_PRIMARIA_PLATAFORMA) : null

  const navbarTenant =
    ctx?.modo === 'torcida'
      ? { nome: ctx.tenant.nome, corPrimaria: ctx.tenant.corPrimaria, logoUrl: ctx.tenant.logoUrl }
      : ctx?.modo === 'nacional'
        ? {
            nome: ctx.afiliacao.apelido ?? ctx.afiliacao.nome,
            corPrimaria: corNacional ?? COR_PRIMARIA_PLATAFORMA,
            logoUrl: ctx.afiliacao.escudoUrl,
          }
        : { nome: 'Torcida', corPrimaria: COR_PRIMARIA_PLATAFORMA, logoUrl: null }

  // Design completo: tenant real no modo torcida, tenant sintético (paleta do
  // clube) no modo nacional.
  const hostTenant = ctx?.modo === 'torcida' ? await getTenantFromHost() : null
  const designBridgeProps =
    ctx?.modo === 'torcida' && hostTenant
      ? { corPrimaria: hostTenant.corPrimaria, design: hostTenant.design }
      : ctx?.modo === 'nacional' && ctx.tenantSintetico
        ? { corPrimaria: ctx.tenantSintetico.corPrimaria, design: ctx.tenantSintetico.design }
        : null

  const [avatarUrl, userName] = await Promise.all([
    getAvatarAtualDoUsuario(session.user.id),
    getNomeAtualDoUsuario(session.user.id),
  ])

  const navbar = (
    <PortalNavbar
      userName={userName ?? session.user.name ?? null}
      userAvatar={avatarUrl}
      tenant={navbarTenant}
      temDepartamentos={totalDepartamentos > 0}
      modoNacional={ctx?.modo === 'nacional'}
      // Convite TORCEDOR: torcidaReal/unidade liberam Loja/Sedes/Agenda nas
      // abas de canal (a navbar oculta esses links no escopo nacional).
      temVinculoTorcida={Boolean(
        ctx?.modo === 'nacional' && (ctx.torcidaReal || ctx.unidade),
      )}
      tenantSlugAtual={hostTenant?.slug ?? null}
    />
  )

  return (
    <div className="app-shell-bg min-h-screen">
      {designBridgeProps ? (
        <TenantDesignBridge
          corPrimaria={designBridgeProps.corPrimaria}
          design={designBridgeProps.design}
        />
      ) : null}
      <NavbarBrandOverrideProvider>
        <Suspense fallback={navbar}>{navbar}</Suspense>
        <main className="app-container relative py-4 sm:py-8">
          <PortalMotionShell>{children}</PortalMotionShell>
        </main>
      </NavbarBrandOverrideProvider>
    </div>
  )
}
