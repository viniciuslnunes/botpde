import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Building2,
  ClipboardList,
  IdCard,
  Shield,
  Users,
} from 'lucide-react'
import { hasPermission, PERMISSIONS } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import { carregarDirecaoDiretoria } from '@/lib/diretoria-direcao'
import {
  AdminInboxList,
  AdminPageHeader,
  DirecaoInboxSkeleton,
  DirecaoKpisSkeleton,
  DirecaoListaSkeleton,
  KpiGrid,
  StatCard,
} from '@/components/admin/ui'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Diretoria — Admin' }

type DiretoriaPermissoes = {
  podeMembros: boolean
  podeRoles: boolean
  podeModerar: boolean
  podeLoja: boolean
  podeAprovar: boolean
}

function filtrarPendenciasVisiveis(
  pendencias: Awaited<ReturnType<typeof carregarDirecaoDiretoria>>['pendencias'],
  perm: DiretoriaPermissoes,
) {
  return pendencias.filter((p) => {
    if (p.id.startsWith('mem-') || p.id === 'fila-mais' || p.id === 'lge-vencida') {
      return perm.podeMembros
    }
    if (p.id === 'deptos-sem-gestor' || p.id === 'sem-depto') return perm.podeRoles
    if (p.id === 'denuncias') return perm.podeModerar
    if (p.id === 'loja-pedidos') return perm.podeLoja
    return true
  })
}

async function DiretoriaKpis({
  tenantId,
  perm,
}: {
  tenantId: string
  perm: DiretoriaPermissoes
}) {
  const ops = await carregarDirecaoDiretoria(tenantId)
  return (
    <KpiGrid cols={4}>
      <StatCard
        label="Fila de admissão"
        value={ops.membrosPendentes}
        tone={ops.membrosPendentes > 0 ? 'warning' : 'default'}
        icon={<Users className="h-5 w-5" />}
        href={perm.podeMembros ? '/admin/membros?status=PENDENTE' : undefined}
      />
      <StatCard
        label="Sócios"
        value={ops.sociosAtivos}
        icon={<IdCard className="h-5 w-5" />}
        href={perm.podeMembros ? '/admin/socios' : undefined}
      />
      <StatCard
        label="Carteirinhas vencidas"
        value={ops.carteirinhasVencidas}
        tone={ops.carteirinhasVencidas > 0 ? 'warning' : 'default'}
        icon={<Shield className="h-5 w-5" />}
        href={perm.podeMembros ? '/admin/socios' : undefined}
      />
      <StatCard
        label="Deptos com gestor"
        value={`${ops.deptosOk}/${ops.deptosOk + ops.deptosSemGestor.length}`}
        tone={ops.deptosSemGestor.length > 0 ? 'warning' : 'success'}
        icon={<Building2 className="h-5 w-5" />}
        href={perm.podeRoles ? '/admin/departamentos' : undefined}
      />
    </KpiGrid>
  )
}

async function DiretoriaInboxELista({
  tenantId,
  perm,
}: {
  tenantId: string
  perm: DiretoriaPermissoes
}) {
  const ops = await carregarDirecaoDiretoria(tenantId)
  const pendenciasVisiveis = filtrarPendenciasVisiveis(ops.pendencias, perm)

  return (
    <>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
          Precisa de você
        </h2>
        <AdminInboxList
          itens={pendenciasVisiveis}
          podeAgir={perm.podeAprovar}
          emptyTitle="Prancheta limpa."
          emptyDescription="Sem filas ou alertas no seu escopo de permissão."
        />
      </section>

      {perm.podeRoles && ops.deptosSemGestor.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
            Departamentos sem gestor
          </h2>
          <ul className="divide-y divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
            {ops.deptosSemGestor.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/portal/departamentos/${d.slug}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-[rgb(var(--muted)_/_0.35)]"
                >
                  <span className="font-medium">{d.nome}</span>
                  <span className="text-xs text-[rgb(var(--foreground-muted))]">
                    Nomear no portal
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

async function DiretoriaHeaderLinks({ tenantId }: { tenantId: string }) {
  const ops = await carregarDirecaoDiretoria(tenantId)
  return (
    <Link
      href={`/portal/departamentos/${ops.departamentoSlug}`}
      className="app-touch-line text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
    >
      Cockpit no portal
    </Link>
  )
}

export default async function AdminDiretoriaPage() {
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  let effective: string[] = []
  let isSuperAdmin = false
  try {
    const authz = await assertAnyPermission([
      PERMISSIONS.MEMBERS_VIEW,
      PERMISSIONS.MEMBERS_APPROVE,
      PERMISSIONS.ROLES_MANAGE,
      PERMISSIONS.AUDIT_VIEW,
    ])
    tenant = authz.tenant
    effective = authz.permissoesEfetivas ?? []
    isSuperAdmin = Boolean(authz.isSuperAdmin)
  } catch {
    redirect('/admin')
  }

  const perm: DiretoriaPermissoes = {
    podeMembros:
      isSuperAdmin ||
      hasPermission(effective, PERMISSIONS.MEMBERS_VIEW) ||
      hasPermission(effective, PERMISSIONS.MEMBERS_APPROVE),
    podeRoles: isSuperAdmin || hasPermission(effective, PERMISSIONS.ROLES_MANAGE),
    podeModerar: isSuperAdmin || hasPermission(effective, PERMISSIONS.COMMUNITY_MODERATE),
    podeLoja: isSuperAdmin || hasPermission(effective, PERMISSIONS.STORE_VIEW_ORDERS),
    podeAprovar: isSuperAdmin || hasPermission(effective, PERMISSIONS.MEMBERS_APPROVE),
  }

  return (
    <>
      <AdminPageHeader
        title="Diretoria"
        description="Prancheta: filas institucionais e saúde dos departamentos."
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={null}>
              <DiretoriaHeaderLinks tenantId={tenant.id} />
            </Suspense>
            {perm.podeMembros ? (
              <Link
                href="/admin/membros"
                className="app-touch-line text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Membros
              </Link>
            ) : null}
            {perm.podeRoles ? (
              <Link
                href="/admin/departamentos"
                className="app-touch-line text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Departamentos
              </Link>
            ) : null}
            {isSuperAdmin || hasPermission(effective, PERMISSIONS.AUDIT_VIEW) ? (
              <Link
                href="/admin/auditoria"
                className="app-touch-line text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Auditoria
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="app-container space-y-6 py-6">
        <MotionReveal>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Oversight da unidade — operação de domínio permanece em cada módulo
            (`/admin/departamentos` continua em roles:manage).
          </p>
        </MotionReveal>

        <Suspense fallback={<DirecaoKpisSkeleton cols={4} />}>
          <DiretoriaKpis tenantId={tenant.id} perm={perm} />
        </Suspense>

        <Suspense
          fallback={
            <div className="space-y-6">
              <DirecaoInboxSkeleton />
              <DirecaoListaSkeleton />
            </div>
          }
        >
          <DiretoriaInboxELista tenantId={tenant.id} perm={perm} />
        </Suspense>
      </div>
    </>
  )
}
