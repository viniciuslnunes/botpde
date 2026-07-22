import {
  CATEGORIA_FINANCEIRO_LABEL,
  formatDataCompetenciaInput,
  formatarMoedaBRL,
} from '@torcida/types'
import {
  compararFinanceiroPeriodo,
  resumirFinanceiroMensal,
  resumirFinanceiroPorCategoria,
  type FinanceiroCategoriaResumo,
  type FinanceiroMensal,
  type FinanceiroResumo,
} from '@/lib/financeiro'
import { PERIODO_LABEL, resolverIntervaloPeriodo, type Periodo } from '@/lib/admin-insights'
import { InsightSection, StatCard } from '@/components/admin/ui'
import { DonutChart, MiniBarChart } from '@/components/admin/charts'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

/** Nº de meses do gráfico mensal por período — 30d fica só com os cards. */
const MESES_POR_PERIODO: Record<Periodo, number> = { '30d': 0, '90d': 3, '12m': 12 }

export async function FinanceiroSection({
  tenantId,
  periodo,
}: {
  tenantId: string
  periodo: Periodo
}) {
  const { inicio, fim } = resolverIntervaloPeriodo(periodo)
  const filtroAtual = {
    dataDe: formatDataCompetenciaInput(inicio),
    dataAte: formatDataCompetenciaInput(fim),
  }
  const meses = MESES_POR_PERIODO[periodo]

  const [comparativo, categorias, mensal]: [
    { atual: FinanceiroResumo; anterior: FinanceiroResumo },
    FinanceiroCategoriaResumo[],
    FinanceiroMensal[],
  ] = await Promise.all([
    compararFinanceiroPeriodo(tenantId, periodo),
    resumirFinanceiroPorCategoria(tenantId, filtroAtual),
    meses > 0 ? resumirFinanceiroMensal(tenantId, meses) : Promise.resolve([]),
  ])

  const { atual, anterior } = comparativo
  const vazio = atual.quantidade === 0 && anterior.quantidade === 0

  return (
    <InsightSection
      title="Financeiro"
      description={`Livro-caixa — ${PERIODO_LABEL[periodo].toLowerCase()} vs período anterior.`}
    >
      {vazio ? (
        <div className="sm:col-span-2 lg:col-span-3">
          <MotionEmptyState
            title="Sem lançamentos no período"
            description="Registre receitas e despesas no livro-caixa para ver os indicadores."
          />
        </div>
      ) : (
        <>
          <StatCard
            label="Receitas"
            value={formatarMoedaBRL(atual.totalReceitas)}
            tone="success"
            delta={{ atual: atual.totalReceitas, anterior: anterior.totalReceitas }}
          />
          <StatCard
            label="Despesas"
            value={formatarMoedaBRL(atual.totalDespesas)}
            tone="danger"
            delta={{
              atual: atual.totalDespesas,
              anterior: anterior.totalDespesas,
              invertido: true,
            }}
          />
          <StatCard
            label="Saldo"
            value={formatarMoedaBRL(atual.saldo)}
            tone={atual.saldo >= 0 ? 'success' : 'danger'}
            delta={{ atual: atual.saldo, anterior: anterior.saldo }}
          />

          {mensal.length > 0 ? (
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5 lg:col-span-3">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Receitas × despesas por mês
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
          ) : null}

          {categorias.length > 0 ? (
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5 lg:col-span-3">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Movimentação por categoria
              </h3>
              <DonutChart
                data={categorias.map((c) => ({
                  rotulo: CATEGORIA_FINANCEIRO_LABEL[c.categoria] ?? c.categoria,
                  valor: c.receitas + c.despesas,
                  valorLabel: formatarMoedaBRL(c.receitas + c.despesas),
                }))}
                centro={formatarMoedaBRL(atual.saldo)}
              />
            </div>
          ) : null}
        </>
      )}
    </InsightSection>
  )
}
