import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import {
  CATEGORIA_FINANCEIRO_LABEL,
  PERMISSIONS,
  formatDataCompetenciaInput,
  formatarMoedaBRL,
} from '@torcida/types'
import { assertManageOrOversightView } from '@/lib/authz'
import {
  compararFinanceiroPeriodo,
  resumirFinanceiroMensal,
  resumirFinanceiroPorCategoria,
  type FinanceiroCategoriaResumo,
  type FinanceiroMensal,
  type FinanceiroResumo,
} from '@/lib/financeiro'
import { PERIODO_LABEL, PERIODO_LABEL_CURTO, PERIODO_PADRAO } from '@/lib/admin-insights'
import { InsightSection, StatCard } from '@/components/admin/ui'
import { DonutChart, MiniBarChart } from '@/components/admin/charts'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { TrendingUp } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Evolução — Financeiro' }

function InsightsSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-5 w-44 rounded-lg bg-[rgb(var(--border)_/_0.45)]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-48 rounded-2xl bg-[rgb(var(--border)_/_0.45)] sm:col-span-2" />
        <div className="h-48 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
      </div>
    </div>
  )
}

/** Filtro dataDe/dataAte cobrindo os últimos 12 meses (competência local). */
function ultimosDozeMesesFiltro(): { dataDe: string; dataAte: string } {
  const agora = new Date()
  const inicio = new Date(agora.getFullYear(), agora.getMonth() - 11, 1)
  return {
    dataDe: formatDataCompetenciaInput(inicio),
    dataAte: formatDataCompetenciaInput(agora),
  }
}

async function FinanceiroInsights({ tenantId }: { tenantId: string }) {
  const doze = ultimosDozeMesesFiltro()
  const [mensal, comparativo, categorias]: [
    FinanceiroMensal[],
    { atual: FinanceiroResumo; anterior: FinanceiroResumo },
    FinanceiroCategoriaResumo[],
  ] = await Promise.all([
    resumirFinanceiroMensal(tenantId, 12),
    compararFinanceiroPeriodo(tenantId, PERIODO_PADRAO),
    resumirFinanceiroPorCategoria(tenantId, doze),
  ])

  const temMovimento = mensal.some((m) => m.receitas > 0 || m.despesas > 0)
  if (!temMovimento) {
    return (
      <MotionEmptyState
        icon={<TrendingUp className="mb-4 h-12 w-12 text-[rgb(var(--foreground-muted))]" />}
        title="Sem movimentação para comparar"
        description="Lance receitas e despesas em Lançamentos — a evolução dos últimos 12 meses aparece aqui."
      />
    )
  }

  return (
    <InsightSection
      title="Evolução financeira"
      description={`Receitas × despesas dos últimos 12 meses e saldo dos últimos ${PERIODO_LABEL_CURTO[PERIODO_PADRAO]}.`}
    >
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Receitas × despesas (12 meses)
        </h3>
        <MiniBarChart
          data={mensal.map((m) => ({
            rotulo: m.mes,
            valor: m.receitas,
            valorSecundario: m.despesas,
            cor: 'rgb(var(--color-success) / 0.75)',
          }))}
          formato="moeda"
          legenda={{ principal: 'Receitas', secundaria: 'Despesas' }}
        />
      </div>

      <StatCard
        label={`Saldo (${PERIODO_LABEL[PERIODO_PADRAO].toLowerCase()})`}
        value={formatarMoedaBRL(comparativo.atual.saldo)}
        tone={comparativo.atual.saldo >= 0 ? 'success' : 'danger'}
        delta={{ atual: comparativo.atual.saldo, anterior: comparativo.anterior.saldo }}
      />

      {categorias.length > 0 ? (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5 lg:col-span-3">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Movimentação por categoria (12 meses)
          </h3>
          <DonutChart
            data={categorias.map((c) => ({
              rotulo: CATEGORIA_FINANCEIRO_LABEL[c.categoria] ?? c.categoria,
              valor: c.receitas + c.despesas,
              valorLabel: formatarMoedaBRL(c.receitas + c.despesas),
            }))}
          />
        </div>
      ) : null}
    </InsightSection>
  )
}

export default async function FinanceiroEvolucaoPage() {
  let tenant: Awaited<ReturnType<typeof assertManageOrOversightView>>['tenant']
  try {
    ;({ tenant } = await assertManageOrOversightView(
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.FINANCE_VIEW,
    ))
  } catch {
    redirect('/admin')
  }

  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <FinanceiroInsights tenantId={tenant.id} />
    </Suspense>
  )
}
