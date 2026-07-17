import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  DEPARTAMENTOS_SLUGS_LEGADOS_PORTAL,
  hrefHomeDepartamento,
  hrefModuloPortal,
  hrefOperacaoAdmin,
  kindDepartamento,
  resolverModuloPortalDepartamento,
  rotuloAreaDepartamento,
} from '@torcida/types'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  resolverDepartamentosHub,
  type DeptoHubBase,
} from '@/lib/departamentos-portal-access'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { ArrowRight, Briefcase, Eye, LayoutGrid, Settings2, Shield } from 'lucide-react'

interface MembershipLite {
  departamentoId: string
  departamento: DeptoHubBase
}
interface GestorLite {
  departamentoId: string
}

const LEGACY = new Set<string>(DEPARTAMENTOS_SLUGS_LEGADOS_PORTAL)

export function DepartamentosFallback() {
  return (
    <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-44 rounded-2xl bg-[rgb(var(--border))]" />
      ))}
    </div>
  )
}

export async function DepartamentosSection() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  const isSuperAdmin = isSuperAdminEmail(session.user.email)

  const [meusDepartamentos, gestorDe, todosTenant]: [
    MembershipLite[],
    GestorLite[],
    DeptoHubBase[],
  ] = await Promise.all([
    db.userDepartamento.findMany({
      where: { userId: session.user.id, tenantId: tenant.id },
      select: {
        departamentoId: true,
        departamento: {
          select: {
            id: true,
            nome: true,
            slug: true,
            cor: true,
            permissions: true,
            permissionsGestor: true,
            moduloPortal: true,
            ordem: true,
          },
        },
      },
    }),
    db.departamentoGestor.findMany({
      where: { userId: session.user.id, departamento: { tenantId: tenant.id } },
      select: { departamentoId: true },
    }),
    db.departamento.findMany({
      where: {
        tenantId: tenant.id,
        slug: { notIn: [...DEPARTAMENTOS_SLUGS_LEGADOS_PORTAL] },
      },
      select: {
        id: true,
        nome: true,
        slug: true,
        cor: true,
        permissions: true,
        permissionsGestor: true,
        moduloPortal: true,
        ordem: true,
      },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    }),
  ])

  const diretoriaId = todosTenant.find((d) => d.slug === 'diretoria')?.id ?? null
  const departamentos = resolverDepartamentosHub({
    todos: todosTenant.filter((d) => !LEGACY.has(d.slug)),
    membershipIds: meusDepartamentos
      .filter((m) => !LEGACY.has(m.departamento.slug))
      .map((m) => m.departamentoId),
    gestorIds: gestorDe.map((g) => g.departamentoId),
    diretoriaId,
    isSuperAdmin,
  })

  if (departamentos.length === 0) {
    return (
      <MotionEmptyState
        icon={<Briefcase className="mb-3 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
        title="Você ainda não faz parte de nenhum departamento."
        description="Quando a diretoria te incluir em um departamento, as áreas aparecem aqui."
      />
    )
  }

  const isDiretoria =
    isSuperAdmin ||
    (diretoriaId != null &&
      meusDepartamentos.some((m) => m.departamentoId === diretoriaId))

  return (
    <div className="space-y-4">
      {isDiretoria && (
        <p className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))]">
          Como Diretoria, você vê todas as áreas. Gestão e operação só aparecem onde você
          é gestor daquele departamento (ou tem a permissão correspondente).
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {departamentos.map((depto, index) => {
          const moduloKey = resolverModuloPortalDepartamento(depto.slug, depto.moduloPortal)
          const homeHref = hrefHomeDepartamento(depto.slug)
          const moduloHref = hrefModuloPortal(moduloKey)
          const operacaoHref = hrefOperacaoAdmin(moduloKey)
          const areaLabel = rotuloAreaDepartamento(depto.slug, depto.moduloPortal)
          const kind = kindDepartamento(depto.slug)
          const papelLabel = depto.visaoDiretoria
            ? 'visão Diretoria'
            : depto.isGestor
              ? 'gestor'
              : 'membro'

          return (
            <MotionReveal key={depto.id} index={index}>
              <div className="flex h-full flex-col rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: depto.cor }}
                  >
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
                        {depto.nome}
                      </h2>
                      <span
                        className={[
                          'rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          kind === 'plugin'
                            ? 'bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]'
                            : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                        ].join(' ')}
                      >
                        {kind === 'plugin' ? 'Plugin' : 'Compõe'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                      {areaLabel}
                      {' · '}
                      {papelLabel}
                    </p>
                  </div>
                </div>

                <div className="mt-auto flex flex-col gap-2 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={homeHref}
                      className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                    >
                      Abrir área
                      <ArrowRight className="h-4 w-4 shrink-0" />
                    </Link>
                    {moduloHref && depto.isAtuacao && (
                      <Link
                        href={moduloHref}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                      >
                        <LayoutGrid className="h-4 w-4 text-[rgb(var(--primary))]" />
                        Módulo
                      </Link>
                    )}
                    {depto.visaoDiretoria && (
                      <span className="inline-flex items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
                        <Eye className="h-3.5 w-3.5" />
                        Somente leitura da área
                      </span>
                    )}
                  </div>
                  {depto.isGestor && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`${homeHref}#gestao`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                      >
                        <Settings2 className="h-4 w-4 text-[rgb(var(--primary))]" />
                        Gestão
                      </Link>
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
                  )}
                </div>
              </div>
            </MotionReveal>
          )
        })}
      </div>
    </div>
  )
}
