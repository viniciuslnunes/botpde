import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart3,
  Beer,
  Calendar,
  CreditCard,
  MessagesSquare,
  ShoppingBag,
  Users,
  Wallet,
} from 'lucide-react'
import type { Metadata } from 'next'
import { PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { AdminPageHeader, AdminTabs, adminTabIds, type AdminTabItem } from '@/components/admin/ui'
import { buildAdminHref } from '@/lib/admin-href'
import { parseAcervoTab } from '@/lib/acervo-tab'
import { PERIODO_LABEL, PERIODO_PADRAO, PERIODOS, type Periodo } from '@/lib/admin-insights'
import { AssociacaoSection } from './sections/associacao-section'
import { BarSection } from './sections/bar-section'
import { ComunidadeSection } from './sections/comunidade-section'
import { EventosSection } from './sections/eventos-section'
import { FinanceiroSection } from './sections/financeiro-section'
import { LojaSection } from './sections/loja-section'
import { MembrosSection } from './sections/membros-section'

export const metadata: Metadata = { title: 'Relatórios — Admin' }

const BASE_PATH = '/admin/relatorios'
const PARAM_TAB = 'tab'
const RELATORIO_TABS = [
  'financeiro',
  'membros',
  'associacao',
  'bar',
  'loja',
  'eventos',
  'comunidade',
] as const
const ICONE_TAB = 'h-4 w-4 shrink-0'

type RelatorioTab = (typeof RELATORIO_TABS)[number]

type Props = { searchParams: Promise<{ periodo?: string; tab?: string }> }

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

function RelatorioAtivo({
  tab,
  tenantId,
  periodo,
}: {
  tab: RelatorioTab
  tenantId: string
  periodo: Periodo
}) {
  switch (tab) {
    case 'financeiro':
      return <FinanceiroSection tenantId={tenantId} periodo={periodo} />
    case 'membros':
      return <MembrosSection tenantId={tenantId} periodo={periodo} />
    case 'associacao':
      return <AssociacaoSection tenantId={tenantId} />
    case 'bar':
      return <BarSection tenantId={tenantId} periodo={periodo} />
    case 'loja':
      return <LojaSection tenantId={tenantId} periodo={periodo} />
    case 'eventos':
      return <EventosSection tenantId={tenantId} periodo={periodo} />
    case 'comunidade':
      return <ComunidadeSection tenantId={tenantId} periodo={periodo} />
  }
}

export default async function RelatoriosPage({ searchParams }: Props) {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.REPORTS_VIEW))
  } catch {
    redirect('/admin')
  }

  const sp = await searchParams
  const periodo: Periodo =
    sp.periodo === '30d' || sp.periodo === '12m' ? sp.periodo : PERIODO_PADRAO
  const tab = parseAcervoTab(sp.tab, RELATORIO_TABS, 'financeiro')
  const { tabId, panelId } = adminTabIds(PARAM_TAB, tab)

  const tabs: AdminTabItem[] = [
    { id: 'financeiro', label: 'Financeiro', icon: <Wallet className={ICONE_TAB} /> },
    { id: 'membros', label: 'Membros', icon: <Users className={ICONE_TAB} /> },
    { id: 'associacao', label: 'Associação', icon: <CreditCard className={ICONE_TAB} /> },
    { id: 'bar', label: 'Bar', icon: <Beer className={ICONE_TAB} /> },
    { id: 'loja', label: 'Loja', icon: <ShoppingBag className={ICONE_TAB} /> },
    { id: 'eventos', label: 'Eventos', icon: <Calendar className={ICONE_TAB} /> },
    { id: 'comunidade', label: 'Comunidade', icon: <MessagesSquare className={ICONE_TAB} /> },
  ]

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title="Relatórios"
        description="Inteligência administrativa da torcida — indicadores por período."
      />

      <div className="app-container min-w-0 flex-1 space-y-6 py-5 sm:py-8">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período dos relatórios">
          {PERIODOS.map((p) => {
            const ativo = p === periodo
            return (
              <Link
                key={p}
                href={buildAdminHref(BASE_PATH, {
                  periodo: p === PERIODO_PADRAO ? undefined : p,
                  tab: tab === 'financeiro' ? undefined : tab,
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

        <AdminTabs
          tabs={tabs}
          basePath={BASE_PATH}
          activeId={tab}
          paramKey={PARAM_TAB}
          extraParams={{ periodo: periodo === PERIODO_PADRAO ? undefined : periodo }}
        />

        <div id={panelId} role="tabpanel" aria-labelledby={tabId}>
          <Suspense fallback={<SectionSkeleton />}>
            <RelatorioAtivo tab={tab} tenantId={tenant.id} periodo={periodo} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
