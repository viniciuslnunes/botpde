import { formatarMoedaBRL } from '@torcida/types'
import { resumirInadimplencia, type InadimplenciaResumo } from '@/lib/cobrancas-insights'
import { resumirCarteirinhas, type CarteirinhasResumo } from '@/lib/membros-insights'
import { InsightSection, StatCard } from '@/components/admin/ui'
import { DonutChart, MiniBarChart } from '@/components/admin/charts'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

export async function AssociacaoSection({ tenantId }: { tenantId: string }) {
  const [inadimplencia, carteirinhas]: [InadimplenciaResumo, CarteirinhasResumo] =
    await Promise.all([resumirInadimplencia(tenantId), resumirCarteirinhas(tenantId)])

  const totalCarteirinhas =
    carteirinhas.emDia + carteirinhas.vencendo30d + carteirinhas.vencidas
  const vazio =
    inadimplencia.quantidadeEmAtraso === 0 &&
    inadimplencia.mrrAtual === 0 &&
    inadimplencia.mrrAnterior === 0 &&
    totalCarteirinhas === 0

  return (
    <InsightSection
      title="Associação"
      description="Mensalidades, inadimplência e situação das carteirinhas — visão do momento."
    >
      {vazio ? (
        <div className="sm:col-span-2 lg:col-span-3">
          <MotionEmptyState
            title="Sem movimento de associação"
            description="Cobranças e carteirinhas emitidas aparecem aqui."
          />
        </div>
      ) : (
        <>
          <StatCard
            label="Mensalidades no mês (MRR)"
            value={formatarMoedaBRL(inadimplencia.mrrAtual)}
            tone="success"
            delta={{ atual: inadimplencia.mrrAtual, anterior: inadimplencia.mrrAnterior }}
            href="/admin/cobrancas"
          />
          <StatCard
            label="Valor em atraso"
            value={formatarMoedaBRL(inadimplencia.valorEmAtraso)}
            tone={inadimplencia.valorEmAtraso > 0 ? 'danger' : 'success'}
            badge={
              inadimplencia.taxaInadimplencia !== null
                ? `${(inadimplencia.taxaInadimplencia * 100).toLocaleString('pt-BR', {
                    maximumFractionDigits: 1,
                  })}% do exigível em 90d`
                : undefined
            }
            badgeTone="danger"
            href="/admin/cobrancas?status=VENCIDA"
          />
          <StatCard
            label="Cobranças em atraso"
            value={inadimplencia.quantidadeEmAtraso}
            tone={inadimplencia.quantidadeEmAtraso > 0 ? 'warning' : 'default'}
            href="/admin/cobrancas?status=VENCIDA"
          />

          {inadimplencia.valorEmAtraso > 0 ? (
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Aging do atraso
              </h3>
              <MiniBarChart
                data={inadimplencia.aging.map((b) => ({
                  rotulo: b.faixa,
                  valor: b.valor,
                  cor: 'rgb(var(--color-danger) / 0.7)',
                }))}
                formato="moeda"
              />
            </div>
          ) : null}

          {totalCarteirinhas > 0 ? (
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Carteirinhas
              </h3>
              <DonutChart
                data={[
                  {
                    rotulo: 'Em dia',
                    valor: carteirinhas.emDia,
                    cor: 'rgb(var(--color-success) / 0.8)',
                  },
                  {
                    rotulo: 'Vencendo em 30d',
                    valor: carteirinhas.vencendo30d,
                    cor: 'rgb(var(--color-warning) / 0.8)',
                  },
                  {
                    rotulo: 'Vencidas',
                    valor: carteirinhas.vencidas,
                    cor: 'rgb(var(--color-danger) / 0.8)',
                  },
                ]}
                centro={String(totalCarteirinhas)}
              />
            </div>
          ) : null}
        </>
      )}
    </InsightSection>
  )
}
