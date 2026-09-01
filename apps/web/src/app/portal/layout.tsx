import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import {
  resolverBrandPorEscopo,
  resolverEscopoComunidadePorModo,
} from '@/lib/comunidade-escopo'
import { lerEscopoComunidadePersistido } from '@/lib/comunidade-escopo-cookie'
import { lerMarcaCanalFoco } from '@/lib/comunidade-canal-foco-cookie'
import { getAvatarAtualDoUsuario, getNomeAtualDoUsuario } from '@/lib/perfil-social'
import { getEstadoOnboarding } from '@/lib/onboarding'
import { Suspense } from 'react'
import { isSuperAdminEmail, usuarioPrecisaNickname } from '@/lib/tenant-context'
import { PortalNavbar } from '@/components/portal/navbar'
import { PortalMotionShell } from '@/components/motion/portal-motion-shell'
import { TenantDesignBridge } from '@/components/tenant-design-bridge'
import { getTenantFromHost } from '@/lib/tenant'
import { NavbarBrandOverrideProvider } from '@/lib/navbar-brand-override'
import { ModoOperadorProvider } from '@/lib/modo-operador'
import { COR_PRIMARIA_PLATAFORMA } from '@torcida/types'
import { carregarPendenciasCadastro } from '@/lib/pendencias-cadastro-server'
import { resolverTenantCarteirinhaId } from '@/lib/associacao-escopo-server'
import { PendenciasCadastroModal } from '@/components/portal/pendencias-cadastro-modal'
import { resolverCtaAssocieSeNavbar } from '@/lib/associe-se'

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

  // Super-admin sem torcida ativa (cookie/vínculo): evita loop
  // `/portal/comunidade` → `/` → `/portal/comunidade`. Manda ao seletor com
  // `proxima` para, ao escolher, abrir a comunidade em modo operador.
  if (!ctx) {
    if (isSuperAdmin) {
      redirect('/super-admin/torcidas?proxima=/portal/comunidade')
    }
    redirect('/onboarding')
  }

  // Link agregado "Departamentos" na navbar — hub de áreas (atuação + visão Diretoria).
  // Áreas → /portal/departamentos → /portal/departamentos/[slug]
  const totalDepartamentos: number =
    ctx.modo === 'torcida'
      ? await db.userDepartamento.count({
          where: { userId: session.user.id, tenantId: ctx.tenant.id },
        })
      : 0

  // Modo nacional (torcedor global sem tenant real) herda a cor/design do
  // tenant sintético da Comunidade Nacional do clube em vez do roxo de fábrica.
  const corNacional = ctx.modo === 'nacional' ? (ctx.tenantSintetico?.corPrimaria ?? COR_PRIMARIA_PLATAFORMA) : null

  const navbarTenant =
    ctx.modo === 'torcida'
      ? { nome: ctx.tenant.nome, corPrimaria: ctx.tenant.corPrimaria, logoUrl: ctx.tenant.logoUrl }
      : ctx.modo === 'nacional'
        ? {
            nome: ctx.afiliacao.apelido ?? ctx.afiliacao.nome,
            corPrimaria: corNacional ?? COR_PRIMARIA_PLATAFORMA,
            logoUrl: ctx.afiliacao.escudoUrl,
          }
        : { nome: 'Torcida', corPrimaria: COR_PRIMARIA_PLATAFORMA, logoUrl: null }

  // Escopo do canal que a pessoa está lendo (cookie gravado pelas abas-escudo
  // da Comunidade). Fora de `/portal/comunidade` não existe `?escopo=`, então
  // é ele que mantém Agenda/Sedes/Loja no canal selecionado em vez de jogar o
  // header de volta para a Comunidade Nacional. Sempre revalidado contra os
  // escopos que a pessoa realmente tem — cookie não concede acesso.
  const escopoCanal = resolverEscopoComunidadePorModo(
    ctx.modo,
    ctx.escopos,
    await lerEscopoComunidadePersistido(),
    { tenantAtivoEhUnidade: ctx.modo === 'torcida' && Boolean(ctx.tenantAtivoEhUnidade) },
  )

  const brandEscopo = resolverBrandPorEscopo(escopoCanal, {
    afiliacao: ctx.afiliacao,
    torcidaReal:
      ctx.torcidaReal ??
      (ctx.modo === 'torcida'
        ? {
            nome: ctx.tenant.nome,
            corPrimaria: ctx.tenant.corPrimaria,
            logoUrl: ctx.tenant.logoUrl,
          }
        : null),
    unidade: ctx.unidade ? { nome: ctx.unidade.nome, logoUrl: ctx.unidade.logoUrl } : null,
    corPrimariaNacional: ctx.tenantSintetico?.corPrimaria ?? null,
  })
  // Canal oficial Caso A (ex.: Taubaté): marca do canal selecionado sobrevive
  // fora do mural — senão Canais/Agenda caem no tenant da sessão (Sede/Rio Claro).
  const brandCanalFoco = await lerMarcaCanalFoco()
  const brandCanal = brandCanalFoco ?? brandEscopo

  // Design completo: tenant real no modo torcida, tenant sintético (paleta do
  // clube) no modo nacional.
  const hostTenant = ctx.modo === 'torcida' ? await getTenantFromHost() : null
  const designBridgeProps =
    ctx.modo === 'torcida' && hostTenant
      ? {
          corPrimaria: hostTenant.corPrimaria,
          design: hostTenant.design,
          slug: hostTenant.slug,
          corArquirrival: hostTenant.corArquirrival,
        }
      : ctx.modo === 'nacional' && ctx.tenantSintetico
        ? {
            corPrimaria: ctx.tenantSintetico.corPrimaria,
            design: ctx.tenantSintetico.design,
            slug: null as string | null,
            corArquirrival: null as string | null,
          }
        : null

  const [avatarUrl, userName, pendenciasSnap, associeSe] = await Promise.all([
    getAvatarAtualDoUsuario(session.user.id),
    getNomeAtualDoUsuario(session.user.id),
    ctx.modo === 'torcida' && !isSuperAdmin
      ? resolverTenantCarteirinhaId(ctx.tenant.id, session.user.id)
          .then((tenantId) => carregarPendenciasCadastro(tenantId, session.user.id))
          .catch((err: unknown) => {
            console.error('[portal/layout] pendencias cadastro', err)
            return null
          })
      : Promise.resolve(null),
    isSuperAdmin ? Promise.resolve(null) : resolverCtaAssocieSeNavbar(session.user.id),
  ])

  const navbar = (
    <PortalNavbar
      userName={userName ?? session.user.name ?? null}
      userAvatar={avatarUrl}
      tenant={navbarTenant}
      temDepartamentos={totalDepartamentos > 0 || isSuperAdmin}
      modoNacional={ctx.modo === 'nacional'}
      // Convite TORCEDOR: torcidaReal/unidade liberam Loja/Sedes/Agenda nas
      // abas de canal (a navbar oculta esses links no escopo nacional).
      temVinculoTorcida={Boolean(
        ctx.modo === 'nacional' && (ctx.torcidaReal || ctx.unidade),
      )}
      tenantSlugAtual={hostTenant?.slug ?? null}
      escopoCanal={escopoCanal}
      brandCanal={brandCanal}
      associeSe={associeSe}
      isSuperAdmin={isSuperAdmin}
    />
  )

  return (
    <div className="app-shell-bg min-h-dvh">
      {designBridgeProps ? (
        <TenantDesignBridge
          corPrimaria={designBridgeProps.corPrimaria}
          design={designBridgeProps.design}
          slug={designBridgeProps.slug}
          corArquirrival={designBridgeProps.corArquirrival}
        />
      ) : null}
      <NavbarBrandOverrideProvider>
        <Suspense fallback={navbar}>{navbar}</Suspense>
        <main className="app-container relative py-4 sm:py-8">
          <ModoOperadorProvider
            ativo={ctx.modo === 'torcida' && Boolean(ctx.operador)}
          >
            <PortalMotionShell>{children}</PortalMotionShell>
          </ModoOperadorProvider>
        </main>
        {pendenciasSnap && pendenciasSnap.visiveis.length > 0 ? (
          <PendenciasCadastroModal pendencias={pendenciasSnap.visiveis} />
        ) : null}
      </NavbarBrandOverrideProvider>
    </div>
  )
}
