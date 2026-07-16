import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import {
  calculateEffectivePermissions,
  capabilityPorSlug,
  DEPARTAMENTO_MODULOS,
  hasPermission,
  hrefModuloPortal,
  hrefOperacaoAdmin,
  PERMISSIONS,
} from '@torcida/types'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
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
import {
  FinanceiroCaixaAside,
  FinanceiroCaixaSkeleton,
} from '../_components/financeiro-caixa-aside'
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Landmark,
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

const MODULO_LABEL = new Map<string, string>(
  DEPARTAMENTO_MODULOS.map((m) => [m.key, m.label]),
)

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
    },
  })
  if (!depto) notFound()

  const membership: { id: string } | null = await db.userDepartamento.findFirst({
    where: {
      userId: session.user.id,
      tenantId: tenant.id,
      departamentoId: depto.id,
    },
    select: { id: true },
  })
  if (!membership && !isSuperAdmin) redirect('/portal/departamentos')

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
  const moduloHref = hrefModuloPortal(depto.moduloPortal)
  const operacaoHref = isGestor ? hrefOperacaoAdmin(depto.moduloPortal) : null
  const moduloLabel = depto.moduloPortal ? MODULO_LABEL.get(depto.moduloPortal) : null
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
              {moduloLabel ? `Módulo · ${moduloLabel}` : 'Área da torcida'}
              {isGestor ? ' · você é gestor' : ' · você é membro'}
              {panel === 'diretoria' && isGestor && totalPendentes > 0
                ? ` · ${totalPendentes} pendente${totalPendentes === 1 ? '' : 's'}`
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {moduloHref && (panel !== 'financeiro' || podeVerFinanceiro) && (
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

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {panel === 'diretoria' && isGestor && podeAprovar && (
            <DepartamentoFilaMembros
              pendentes={pendentes}
              totalPendentes={totalPendentes}
            />
          )}
          <DepartamentoEquipe
            departamentoId={depto.id}
            slug={depto.slug}
            membros={membros}
            isGestor={isGestor}
            currentUserId={session.user.id}
          />
        </div>

        <aside className="space-y-4">
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
          ) : (
            <PainelDominio
              panel={panel}
              isGestor={isGestor}
              operacaoHref={operacaoHref}
              totalPendentes={totalPendentes}
            />
          )}
        </aside>
      </div>
    </div>
  )
}

function PainelDominio({
  panel,
  isGestor,
  operacaoHref,
  totalPendentes,
}: {
  panel: string
  isGestor: boolean
  operacaoHref: string | null
  totalPendentes: number
}) {
  if (panel === 'patrimonio') {
    return (
      <div className="space-y-4">
        <MotionEmptyState
          icon={<Landmark className="mb-3 h-8 w-8 text-stone-600 dark:text-stone-300" />}
          title="Patrimônio em construção"
          description="Inventário e responsáveis por item vão viver nesta área do portal."
          className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-10 text-center"
        />
        {isGestor && operacaoHref && (
          <Link
            href={operacaoHref}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Shield className="h-4 w-4" />
            Abrir operação (admin)
          </Link>
        )}
      </div>
    )
  }
  if (panel === 'diretoria') {
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
  if (panel === 'bateria' || panel === 'caravanas') {
    return (
      <MotionEmptyState
        icon={<Briefcase className="mb-3 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
        title="Fluxos específicos em breve"
        description={
          panel === 'bateria'
            ? 'Ensaios e presença serão plugins desta área.'
            : 'Listas de embarque e custo de caravana serão plugins desta área.'
        }
        className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-10 text-center"
      />
    )
  }

  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Sobre a área</h2>
      <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
        Use a equipe ao lado e o módulo vinculado quando disponível. Gestores podem incluir
        pessoas e abrir a operação admin do domínio.
      </p>
    </div>
  )
}
