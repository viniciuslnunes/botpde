import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import type { Metadata } from 'next'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { AdminPageHeader } from '@/components/admin/ui'
import { buildAdminHref } from '@/lib/admin-href'
import { PERIODO_LABEL, PERIODOS, type Periodo } from '@/lib/admin-insights'
import { AssociacaoSection } from './sections/associacao-section'
import { BarSection } from './sections/bar-section'
import { ComunidadeSection } from './sections/comunidade-section'
import { EventosSection } from './sections/eventos-section'
import { FinanceiroSection } from './sections/financeiro-section'
import { LojaSection } from './sections/loja-section'
import { MembrosSection } from './sections/membros-section'

export const metadata: Metadata = { title: 'Relatórios — Admin' }

type Props = { searchParams: Promise<{ periodo?: string }> }

function SectionSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-5 w-40 rounded-lg bg-[rgb(var(--border)_/_0.45)]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
    </div>
  )
}

export default async function RelatoriosPage({ searchParams }: Props) {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.REPORTS_VIEW))
  } catch {
    redirect('/admin')
  }

  const sp = await searchParams
  const periodo: Periodo = sp.periodo === '90d' || sp.periodo === '12m' ? sp.periodo : '30d'

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title="Relatórios"
        description="Inteligência administrativa da torcida — indicadores por período."
      />

      <div className="app-container min-w-0 flex-1 space-y-8 py-5 sm:py-8">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período dos relatórios">
          {PERIODOS.map((p) => {
            const ativo = p === periodo
            return (
              <Link
                key={p}
                href={buildAdminHref('/admin/relatorios', {
                  periodo: p === '30d' ? undefined : p,
                })}
                aria-current={ativo ? 'page' : undefined}
                className={[
                  'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                  ativo
                    ? 'bg-[rgb(var(--color-primary)_/_0.14)] font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.4)]'
                    : 'border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              >
                {PERIODO_LABEL[p]}
              </Link>
            )
          })}
        </div>

        <Suspense fallback={<SectionSkeleton />}>
          <FinanceiroSection tenantId={tenant.id} periodo={periodo} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton />}>
          <MembrosSection tenantId={tenant.id} periodo={periodo} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton />}>
          <AssociacaoSection tenantId={tenant.id} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton />}>
          <BarSection tenantId={tenant.id} periodo={periodo} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton />}>
          <LojaSection tenantId={tenant.id} periodo={periodo} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton />}>
          <EventosSection tenantId={tenant.id} periodo={periodo} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton />}>
          <ComunidadeSection tenantId={tenant.id} periodo={periodo} />
        </Suspense>
      </div>
    </div>
  )
}
