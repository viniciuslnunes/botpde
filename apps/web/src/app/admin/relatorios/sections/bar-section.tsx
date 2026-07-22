import { formatarMoedaBRL } from '@torcida/types'
import {
  compararVendasBarPeriodo,
  listarMaisVendidosBar,
  resumirMargemBar,
  resumirVendasBarPorDia,
  type BarMaisVendido,
  type BarMargemResumo,
  type BarVendasComparativo,
} from '@/lib/bar'
import {
  PERIODO_LABEL,
  resolverIntervaloPeriodo,
  type Periodo,
  type SerieTemporal,
} from '@/lib/admin-insights'
import { InsightSection, StatCard } from '@/components/admin/ui'
import { MiniBarChart, Sparkline } from '@/components/admin/charts'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

const DIAS_POR_PERIODO: Record<Periodo, number> = { '30d': 30, '90d': 90, '12m': 365 }

export async function BarSection({ tenantId, periodo }: { tenantId: string; periodo: Periodo }) {
  const { inicio } = resolverIntervaloPeriodo(periodo)

  const [comparativo, serie, maisVendidos, margem]: [
    BarVendasComparativo,
    SerieTemporal,
    BarMaisVendido[],
    BarMargemResumo,
  ] = await Promise.all([
    compararVendasBarPeriodo(tenantId, periodo),
    resumirVendasBarPorDia(tenantId, DIAS_POR_PERIODO[periodo]),
    listarMaisVendidosBar(tenantId, periodo),
    resumirMargemBar(tenantId, undefined, { desde: inicio }),
  ])

  const vazio = comparativo.atual.quantidade === 0 && comparativo.anterior.quantidade === 0

  return (
    <InsightSection
      title="Bar"
      description={`Vendas pagas de todas as unidades — ${PERIODO_LABEL[periodo].toLowerCase()} vs período anterior.`}
    >
      {vazio ? (
        <div className="sm:col-span-2 lg:col-span-3">
          <MotionEmptyState
            title="Sem vendas do bar no período"
            description="As vendas registradas no PDV das unidades aparecem aqui."
          />
        </div>
      ) : (
        <>
          <StatCard
            label="Vendido no período"
            value={formatarMoedaBRL(comparativo.atual.totalPago)}
            tone="success"
            delta={{
              atual: comparativo.atual.totalPago,
              anterior: comparativo.anterior.totalPago,
            }}
            href="/admin/bar"
          />
          <StatCard
            label="Vendas pagas"
            value={comparativo.atual.quantidade}
            delta={{
              atual: comparativo.atual.quantidade,
              anterior: comparativo.anterior.quantidade,
            }}
            href="/admin/bar/vendas"
          />
          <StatCard
            label="Margem estimada"
            value={formatarMoedaBRL(margem.margem)}
            tone={margem.margem >= 0 ? 'success' : 'danger'}
          />

          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Vendas por dia
            </h3>
            <Sparkline
              data={serie.map((ponto) => ponto.valor)}
              width={280}
              height={48}
              className="h-12 w-full"
            />
          </div>

          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Mais vendidos
            </h3>
            {maisVendidos.length === 0 ? (
              <p className="text-sm text-[rgb(var(--foreground-muted))]">Sem itens no período.</p>
            ) : (
              <MiniBarChart
                height={90}
                data={maisVendidos.map((p) => ({ rotulo: p.produtoNome, valor: p.quantidade }))}
                formato="unidades"
              />
            )}
          </div>
        </>
      )}
    </InsightSection>
  )
}
