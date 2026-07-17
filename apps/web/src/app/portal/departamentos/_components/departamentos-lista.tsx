import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  DEPARTAMENTOS_SLUGS_LEGADOS_PORTAL,
  hrefHomeDepartamento,
  hrefModuloPortal,
  resolverModuloPortalDepartamento,
  rotuloAreaDepartamento,
} from '@torcida/types'
import { Badge } from '@torcida/ui'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import {
  resolverDepartamentosHub,
  type DeptoHubBase,
  type DeptoHubItem,
} from '@/lib/departamentos-portal-access'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { ArrowRight, Briefcase, Eye, LayoutGrid, Settings2 } from 'lucide-react'
import { iconeDepartamento } from './departamento-icone'

interface MembershipLite {
  departamentoId: string
  departamento: DeptoHubBase
}
interface GestorLite {
  departamentoId: string
}

const LEGACY = new Set<string>(DEPARTAMENTOS_SLUGS_LEGADOS_PORTAL)

/** Rótulo curto do atalho para o módulo portal (não a home da área). */
function rotuloAtalhoModulo(slug: string): string {
  switch (slug) {
    case 'financeiro':
      return 'Caixa'
    case 'patrimonio':
      return 'Inventário'
    case 'bateria':
      return 'Ensaios'
    case 'caravanas':
      return 'Caravanas'
    case 'carnaval':
      return 'Barracão'
    case 'materiais-loja':
      return 'Loja'
    case 'comunicacao':
      return 'Comunidade'
    case 'social-e-eventos':
    case 'feminino':
      return 'Eventos'
    default:
      return 'Abrir módulo'
  }
}

function DeptoHubCard({ depto, index }: { depto: DeptoHubItem; index: number }) {
  const moduloKey = resolverModuloPortalDepartamento(depto.slug, depto.moduloPortal)
  const homeHref = hrefHomeDepartamento(depto.slug)
  const moduloHref = hrefModuloPortal(moduloKey)
  const areaLabel = rotuloAreaDepartamento(depto.slug, depto.moduloPortal)
  const Icon = iconeDepartamento(depto.slug)
  const mostraModulo = Boolean(moduloHref) && depto.isAtuacao
  const mostraGestao = depto.isGestor
  const temSecundarios = mostraModulo || mostraGestao

  return (
    <MotionReveal index={index} className="h-full">
      <div className="group relative flex h-full flex-col rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 transition-[border-color,box-shadow] duration-150 hover:border-[rgb(var(--primary)_/_0.45)] hover:shadow-sm">
        <Link
          href={homeHref}
          className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--background))]"
          aria-label={`Abrir área ${depto.nome}`}
        />

        <div className="relative z-10 flex items-start gap-3 pointer-events-none">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: depto.cor }}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h2 className="truncate text-base font-semibold text-[rgb(var(--foreground))]">
                {depto.nome}
              </h2>
              <ArrowRight
                className="mt-1 h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))] opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0.5 group-hover:opacity-100"
                aria-hidden
              />
            </div>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">{areaLabel}</p>
            <div className="mt-2">
              {depto.isGestor ? (
                <Badge variant="primary">Gestor</Badge>
              ) : depto.visaoDiretoria ? (
                <Badge variant="neutral" icon={<Eye className="h-3 w-3" aria-hidden />}>
                  Só leitura
                </Badge>
              ) : (
                <Badge variant="neutral">Membro</Badge>
              )}
            </div>
          </div>
        </div>

        {temSecundarios && (
          <div className="relative z-10 mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[rgb(var(--border))] pt-3 pointer-events-auto">
            {mostraModulo && moduloHref && (
              <Link
                href={moduloHref}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--primary))] transition-opacity hover:opacity-80 focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]"
              >
                <LayoutGrid className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {rotuloAtalhoModulo(depto.slug)}
              </Link>
            )}
            {mostraGestao && (
              <Link
                href={`${homeHref}#gestao`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))] focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]"
              >
                <Settings2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Gestão
              </Link>
            )}
          </div>
        )}
      </div>
    </MotionReveal>
  )
}

function DeptoHubGrid({
  items,
  indexOffset = 0,
}: {
  items: DeptoHubItem[]
  indexOffset?: number
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((depto, i) => (
        <DeptoHubCard key={depto.id} depto={depto} index={indexOffset + i} />
      ))}
    </div>
  )
}

export function DepartamentosFallback() {
  return (
    <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-36 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
        />
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

  const minhasAreas = departamentos.filter((d) => d.isAtuacao)
  const demaisAreas = departamentos.filter((d) => d.visaoDiretoria)
  const temSecoes = minhasAreas.length > 0 && demaisAreas.length > 0

  return (
    <div className="space-y-8">
      {demaisAreas.length > 0 && (
        <p className="rounded-xl border border-[rgb(var(--primary)_/_0.2)] bg-[rgb(var(--primary)_/_0.06)] px-4 py-3 text-sm text-[rgb(var(--foreground-muted))]">
          {temSecoes
            ? 'Como Diretoria, você também vê as demais áreas em só leitura. Gestão só onde você é gestor.'
            : 'Você vê todas as áreas da torcida. Gestão só onde você é gestor.'}
        </p>
      )}

      {temSecoes ? (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Minhas áreas
            </h2>
            <DeptoHubGrid items={minhasAreas} />
          </section>
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Demais áreas
              </h2>
              <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                Visão da Diretoria · só leitura da home
              </p>
            </div>
            <DeptoHubGrid items={demaisAreas} indexOffset={minhasAreas.length} />
          </section>
        </>
      ) : (
        <DeptoHubGrid items={departamentos} />
      )}
    </div>
  )
}
