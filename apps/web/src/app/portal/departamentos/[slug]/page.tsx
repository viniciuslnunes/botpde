import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import {
  calculateEffectivePermissions,
  capabilityPorSlug,
  hasPermission,
  hrefModuloPortal,
  hrefOperacaoAdmin,
  missionDepartamento,
  PERMISSIONS,
  resolverModuloPortalDepartamento,
  rotuloAreaDepartamento,
  subareasDepartamento,
} from '@torcida/types'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { MotionReveal } from '@/components/motion/motion-reveal'
import {
  DepartamentoEquipe,
  type MembroEquipe,
} from '../_components/departamento-equipe'
import {
  DepartamentoFilaMembros,
  type PendenteLite,
} from '../_components/departamento-fila-membros'
import {
  DepartamentoDiretoriaKpis,
  type DiretoriaKpis,
} from '../_components/departamento-diretoria-kpis'
import { DepartamentoSubareasNav } from '../_components/departamento-subareas-nav'
import { DepartamentoProximaAcao } from '../_components/departamento-proxima-acao'
import { resolverProximaAcaoArea } from '../_components/departamento-proxima-acao-data'
import {
  FinanceiroCaixaAside,
  FinanceiroCaixaSkeleton,
} from '../_components/financeiro-caixa-aside'
import {
  PatrimonioInventarioAside,
  PatrimonioInventarioSkeleton,
} from '../_components/patrimonio-inventario-aside'
import {
  CaravanasAgendaAside,
  CaravanasAgendaSkeleton,
} from '../_components/caravanas-agenda-aside'
import {
  BateriaEnsaiosAside,
  BateriaEnsaiosSkeleton,
} from '../_components/bateria-ensaios-aside'
import {
  DepartamentoThinAside,
  DepartamentoThinSkeleton,
} from '../_components/departamento-thin-aside'
import {
  CarnavalBarracaoAside,
  CarnavalBarracaoSkeleton,
} from '../_components/carnaval-barracao-aside'
import { DepartamentoCanalBlock } from '../_components/departamento-canal-block'
import { resolveAcessoPluginEvento } from '@/lib/eventos-plugin-access'
import { podeAbrirDepartamentoPortal } from '@/lib/departamentos-portal-access'
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Shield,
} from 'lucide-react'
import type { Metadata } from 'next'

type DeptoRow = {
  id: string
  nome: string
  slug: string
  cor: string
  moduloPortal: string | null
  permissions: string[]
  permissionsGestor: string[]
  meta: unknown
  canalConversaId: string | null
  canalConversa: { id: string; nome: string | null } | null
}

type Params = { slug: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  return { title: `Departamento · ${slug}` }
}

export default async function DepartamentoHomePage({
  params,
}: {
  params: Promise<Params>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const { slug } = await params
  const isSuperAdmin = isSuperAdminEmail(session.user.email)

  const depto: DeptoRow | null = await db.departamento.findFirst({
    where: { tenantId: tenant.id, slug },
    select: {
      id: true,
      nome: true,
      slug: true,
      cor: true,
      moduloPortal: true,
      permissions: true,
      permissionsGestor: true,
      meta: true,
      canalConversaId: true,
      canalConversa: { select: { id: true, nome: true } },
    },
  })
  if (!depto) notFound()

  const memberships: Array<{ departamentoId: string }> = await db.userDepartamento.findMany({
    where: { userId: session.user.id, tenantId: tenant.id },
    select: { departamentoId: true },
  })
  const membershipIds = memberships.map((m) => m.departamentoId)
  const diretoriaRow: { id: string } | null = await db.departamento.findFirst({
    where: { tenantId: tenant.id, slug: 'diretoria' },
    select: { id: true },
  })
  const podeAbrir = podeAbrirDepartamentoPortal({
    departamentoId: depto.id,
    membershipIds,
    diretoriaId: diretoriaRow?.id ?? null,
    isSuperAdmin,
  })
  if (!podeAbrir) redirect('/portal/departamentos')

  const isMembroDaArea = membershipIds.includes(depto.id)

  const gestao: { id: string } | null = await db.departamentoGestor.findFirst({
    where: { userId: session.user.id, departamentoId: depto.id },
    select: { id: true },
  })
  const isGestor = Boolean(gestao) || isSuperAdmin

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(
    session.user.id,
    tenant.id,
  )
  const effectivePermissions = calculateEffectivePermissions(rolePermissions, overrides)
  const podeAprovar =
    isSuperAdmin || hasPermission(effectivePermissions, PERMISSIONS.MEMBERS_APPROVE)
  const podeVerFinanceiro =
    isSuperAdmin || hasPermission(effectivePermissions, PERMISSIONS.FINANCE_VIEW)
  const podeVerPatrimonio =
    isSuperAdmin || hasPermission(effectivePermissions, PERMISSIONS.PATRIMONY_VIEW)
  const podeVerPedidos =
    isSuperAdmin || hasPermission(effectivePermissions, PERMISSIONS.STORE_VIEW_ORDERS)
  const podeModerar =
    isSuperAdmin || hasPermission(effectivePermissions, PERMISSIONS.COMMUNITY_MODERATE)

  const acessoCaravanas = await resolveAcessoPluginEvento(
    session.user.id,
    tenant.id,
    'caravanas',
    rolePermissions,
    overrides,
    isSuperAdmin,
  )
  const acessoBateria = await resolveAcessoPluginEvento(
    session.user.id,
    tenant.id,
    'bateria',
    rolePermissions,
    overrides,
    isSuperAdmin,
  )

  const membrosRaw: Array<{
    userId: string
    user: {
      id: string
      nome: string | null
      email: string
      nickname: string | null
      avatarUrl: string | null
    }
  }> = await db.userDepartamento.findMany({
    where: { departamentoId: depto.id, tenantId: tenant.id },
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          nome: true,
          email: true,
          nickname: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { criadoEm: 'asc' },
  })

  const gestores: Array<{ userId: string }> = await db.departamentoGestor.findMany({
    where: { departamentoId: depto.id },
    select: { userId: true },
  })
  const gestorSet = new Set(gestores.map((g) => g.userId))

  const membros: MembroEquipe[] = membrosRaw.map((m) => ({
    userId: m.userId,
    nome: m.user.nome,
    email: m.user.email,
    nickname: m.user.nickname,
    avatarUrl: m.user.avatarUrl,
    isGestor: gestorSet.has(m.userId),
  }))
  membros.sort((a, b) => {
    if (a.isGestor !== b.isGestor) return a.isGestor ? -1 : 1
    return (a.nome ?? a.email).localeCompare(b.nome ?? b.email)
  })

  const capability = capabilityPorSlug(depto.slug)
  const moduloKey = resolverModuloPortalDepartamento(depto.slug, depto.moduloPortal)
  const moduloHref = hrefModuloPortal(moduloKey)
  const operacaoHref = isGestor ? hrefOperacaoAdmin(moduloKey) : null
  const moduloLabel = rotuloAreaDepartamento(depto.slug, depto.moduloPortal)
  const mission = missionDepartamento(depto.slug)
  const subareas = subareasDepartamento(depto.slug)
  const panel = capability?.portalPanel ?? 'generico'

  let pendentes: PendenteLite[] = []
  let totalPendentes = 0
  let kpis: DiretoriaKpis | null = null

  if (panel === 'diretoria' && isGestor) {
    const agora = new Date()
    const [porStatus, sociosAtivos, carteirinhasVencidas]: [
      Array<{ status: string; _count: number }>,
      number,
      number,
    ] = await Promise.all([
      db.saasMembro.groupBy({
        by: ['status'],
        where: { tenantId: tenant.id },
        _count: true,
      }),
      db.saasSocio.count({ where: { tenantId: tenant.id } }),
      db.saasSocio.count({
        where: { tenantId: tenant.id, validade: { lt: agora } },
      }),
    ])

    const countBy = Object.fromEntries(porStatus.map((r) => [r.status, r._count])) as Record<
      string,
      number
    >
    kpis = {
      pendentes: countBy.PENDENTE ?? 0,
      aprovados: countBy.APROVADO ?? 0,
      reprovados: countBy.REPROVADO ?? 0,
      sociosAtivos,
      carteirinhasVencidas,
    }
    totalPendentes = kpis.pendentes

    if (podeAprovar) {
      type PendenteRow = {
        id: string
        nome: string
        tipo: 'SOCIO' | 'TORCEDOR'
        cidade: string | null
        criadoEm: Date
        user: { nome: string | null; email: string; avatarUrl: string | null }
      }
      const rows: PendenteRow[] = await db.saasMembro.findMany({
        where: { tenantId: tenant.id, status: 'PENDENTE' },
        orderBy: { criadoEm: 'asc' },
        take: 8,
        select: {
          id: true,
          nome: true,
          tipo: true,
          cidade: true,
          criadoEm: true,
          user: { select: { nome: true, email: true, avatarUrl: true } },
        },
      })
      pendentes = rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        tipo: r.tipo,
        cidade: r.cidade,
        criadoEm: r.criadoEm.toISOString(),
        user: r.user,
      }))
    }
  }

  const proximaAcao = await resolverProximaAcaoArea({
    tenantId: tenant.id,
    slug: depto.slug,
    panel,
    isGestor,
    totalPendentes,
    podeVerFinanceiro,
  })

  type CanalOpcao = { id: string; nome: string | null }
  const canaisDisponiveis: CanalOpcao[] = isGestor
    ? await db.conversa.findMany({
        where: { tenantId: tenant.id, tipo: 'CANAL' },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true },
        take: 40,
      })
    : []

  let carnavalProximos = 0
  if (panel === 'carnaval') {
    carnavalProximos = await db.evento.count({
      where: { tenantId: tenant.id, tipo: 'GERAL', data: { gte: new Date() } },
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/portal/departamentos"
          className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Departamentos
        </Link>
      </div>

      <MotionReveal>
        <header className="flex flex-wrap items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{ backgroundColor: depto.cor }}
          >
            <Briefcase className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">{depto.nome}</h1>
            <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
              {moduloLabel}
              {isGestor
                ? ' · você é gestor'
                : isMembroDaArea
                  ? ' · você é membro'
                  : ' · visão Diretoria (sem gestão)'}
              {panel === 'diretoria' && isGestor && totalPendentes > 0
                ? ` · ${totalPendentes} pendente${totalPendentes === 1 ? '' : 's'}`
                : ''}
            </p>
            <p className="mt-2 max-w-2xl text-sm text-[rgb(var(--foreground-muted))]">{mission}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {moduloHref &&
              (panel === 'financeiro'
                ? podeVerFinanceiro
                : panel === 'patrimonio'
                  ? podeVerPatrimonio
                  : panel === 'caravanas'
                    ? acessoCaravanas.podeVer
                    : panel === 'bateria'
                      ? acessoBateria.podeVer
                      : true) && (
              <Link
                href={moduloHref}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Abrir módulo
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {operacaoHref && (
              <Link
                href={operacaoHref}
                prefetch={false}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
              >
                <Shield className="h-4 w-4 text-[rgb(var(--primary))]" />
                Operação
              </Link>
            )}
          </div>
        </header>
      </MotionReveal>

      <DepartamentoSubareasNav subareas={subareas} />
      <DepartamentoProximaAcao acao={proximaAcao} />

      <DepartamentoCanalBlock
        departamentoId={depto.id}
        slug={depto.slug}
        isGestor={isGestor}
        canal={depto.canalConversa}
        canaisDisponiveis={canaisDisponiveis}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {panel === 'diretoria' && isGestor && podeAprovar && (
            <div id="fila">
              <DepartamentoFilaMembros
                pendentes={pendentes}
                totalPendentes={totalPendentes}
              />
            </div>
          )}
          <div id="equipe">
            <DepartamentoEquipe
              departamentoId={depto.id}
              slug={depto.slug}
              membros={membros}
              isGestor={isGestor}
              currentUserId={session.user.id}
            />
          </div>
        </div>

        <aside id="dominio" className="space-y-4 scroll-mt-20">
          <div id="caixa" className="scroll-mt-20" />
          <div id="mensalidades" className="scroll-mt-20" />
          <div id="inventario" className="scroll-mt-20" />
          <div id="ensaios" className="scroll-mt-20" />
          <div id="agenda" className="scroll-mt-20" />
          <div id="embarque" className="scroll-mt-20" />
          <div id="barracao" className="scroll-mt-20" />
          <div id="avisos" className="scroll-mt-20" />
          <div id="pedidos" className="scroll-mt-20" />
          {panel === 'diretoria' && isGestor && kpis && (
            <DepartamentoDiretoriaKpis kpis={kpis} />
          )}
          {panel === 'financeiro' ? (
            <Suspense fallback={<FinanceiroCaixaSkeleton />}>
              <FinanceiroCaixaAside
                tenantId={tenant.id}
                nome={depto.nome}
                isGestor={isGestor}
                moduloHref={moduloHref}
                operacaoHref={operacaoHref}
                podeVerFinanceiro={podeVerFinanceiro}
              />
            </Suspense>
          ) : panel === 'patrimonio' ? (
            <Suspense fallback={<PatrimonioInventarioSkeleton />}>
              <PatrimonioInventarioAside
                tenantId={tenant.id}
                nome={depto.nome}
                isGestor={isGestor}
                moduloHref={moduloHref}
                operacaoHref={operacaoHref}
                podeVerPatrimonio={podeVerPatrimonio}
              />
            </Suspense>
          ) : panel === 'caravanas' ? (
            <Suspense fallback={<CaravanasAgendaSkeleton />}>
              <CaravanasAgendaAside
                tenantId={tenant.id}
                nome={depto.nome}
                isGestor={isGestor}
                moduloHref={moduloHref}
                operacaoHref={operacaoHref}
                podeVer={acessoCaravanas.podeVer}
              />
            </Suspense>
          ) : panel === 'bateria' ? (
            <Suspense fallback={<BateriaEnsaiosSkeleton />}>
              <BateriaEnsaiosAside
                tenantId={tenant.id}
                nome={depto.nome}
                isGestor={isGestor}
                moduloHref={moduloHref}
                operacaoHref={operacaoHref}
                podeVer={acessoBateria.podeVer}
              />
            </Suspense>
          ) : panel === 'carnaval' ? (
            <Suspense fallback={<CarnavalBarracaoSkeleton />}>
              <CarnavalBarracaoAside
                departamentoId={depto.id}
                slug={depto.slug}
                nome={depto.nome}
                isGestor={isGestor}
                meta={depto.meta}
                proximosCount={carnavalProximos}
              />
            </Suspense>
          ) : panel === 'diretoria' ? (
            <PainelDominio
              isGestor={isGestor}
              operacaoHref={operacaoHref}
              totalPendentes={totalPendentes}
            />
          ) : (
            <Suspense fallback={<DepartamentoThinSkeleton />}>
              <DepartamentoThinAside
                tenantId={tenant.id}
                slug={depto.slug}
                nome={depto.nome}
                isGestor={isGestor}
                moduloHref={moduloHref}
                operacaoHref={operacaoHref}
                podeVerPedidos={podeVerPedidos}
                podeModerar={podeModerar}
              />
            </Suspense>
          )}
        </aside>
      </div>
    </div>
  )
}

function PainelDominio({
  isGestor,
  operacaoHref,
  totalPendentes,
}: {
  isGestor: boolean
  operacaoHref: string | null
  totalPendentes: number
}) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Diretoria</h2>
      <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
        {isGestor
          ? totalPendentes > 0
            ? `${totalPendentes} solicitação${totalPendentes === 1 ? '' : 'ões'} na fila à esquerda. Aprove ou reprove sem sair do portal.`
            : 'Fila de solicitações à esquerda. Quando alguém pedir ingresso, aparece aqui.'
          : 'Você é membro desta área. A gestão da Diretoria é feita pelos gestores.'}
      </p>
      {isGestor && operacaoHref && (
        <Link
          href={operacaoHref}
          prefetch={false}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          <Shield className="h-4 w-4 text-[rgb(var(--primary))]" />
          Operação completa (admin)
        </Link>
      )}
    </div>
  )
}
