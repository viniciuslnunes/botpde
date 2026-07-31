import { formatarMoedaBRL } from '@torcida/types'
import {
  compararVendasBarPeriodo,
  listarMaisVendidosBar,
  resumirConsumoEmAbertoBar,
  resumirMargemBar,
  resumirVendasBarPorDia,
  type BarConsumoEmAbertoResumo,
  type BarMaisVendido,
  type BarMargemResumo,
  type BarVendasComparativo,
} from '@/lib/bar'
import {
  diasDoPeriodo,
  PERIODO_LABEL,
  resolverIntervaloPeriodo,
  type Periodo,
  type SerieTemporal,
} from '@/lib/admin-insights'
import { InsightSection, StatCard } from '@/components/admin/ui'
import { MiniBarChart, Sparkline } from '@/components/admin/charts'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

export async function BarSection({ tenantId, periodo }: { tenantId: string; periodo: Periodo }) {
  const { inicio } = resolverIntervaloPeriodo(periodo)

  const [comparativo, serie, maisVendidos, margem, consumoAberto]: [
    BarVendasComparativo,
    SerieTemporal,
    BarMaisVendido[],
    BarMargemResumo,
    BarConsumoEmAbertoResumo,
  ] = await Promise.all([
    compararVendasBarPeriodo(tenantId, periodo),
    resumirVendasBarPorDia(tenantId, diasDoPeriodo(periodo)),
    listarMaisVendidosBar(tenantId, periodo),
    resumirMargemBar(tenantId, undefined, { desde: inicio }),
    resumirConsumoEmAbertoBar(tenantId),
  ])

  const vazio =
    comparativo.atual.quantidade === 0 &&
    comparativo.anterior.quantidade === 0 &&
    consumoAberto.total === 0

  return (
    <InsightSection
      title="Bar"
      description={`Recebido (venda rápida + pagamentos de comanda) × consumo em aberto — ${PERIODO_LABEL[periodo].toLowerCase()} vs período anterior.`}
    >
      {vazio ? (
        <div className="sm:col-span-2 lg:col-span-3">
          <MotionEmptyState
            title="Sem movimento do bar no período"
            description="Vendas rápidas e pagamentos de comanda confirmados aparecem aqui."
          />
        </div>
      ) : (
        <>
          <StatCard
            label="Recebido no período"
            value={formatarMoedaBRL(comparativo.atual.totalPago)}
            tone="success"
            delta={{
              atual: comparativo.atual.totalPago,
              anterior: comparativo.anterior.totalPago,
            }}
            href="/admin/bar"
          />
          <StatCard
            label="Consumo em aberto"
            value={formatarMoedaBRL(consumoAberto.total)}
            tone={consumoAberto.total > 0 ? 'warning' : 'default'}
            badge={
              consumoAberto.quantidade > 0
                ? `${consumoAberto.quantidade} comanda${consumoAberto.quantidade === 1 ? '' : 's'} ABERTA`
                : undefined
            }
            badgeTone="default"
            href="/admin/bar/comandas"
          />
          <StatCard
            label="Margem estimada"
            value={formatarMoedaBRL(margem.margem)}
            tone={margem.margem >= 0 ? 'success' : 'danger'}
            badge="Consumo (PAGA + EM_COMANDA)"
            badgeTone="default"
          />

          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Recebido por dia
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
              Mais consumidos
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
