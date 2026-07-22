import { formatarMoedaBRL } from '@torcida/types'
import {
  listarMaisVendidosLoja,
  resumirUsoCupons,
  resumirVendasLoja,
  type LojaCupomUso,
  type LojaMaisVendido,
  type LojaVendasResumo,
} from '@/lib/loja-insights'
import { PERIODO_LABEL, type Periodo } from '@/lib/admin-insights'
import { InsightSection, StatCard } from '@/components/admin/ui'
import { MiniBarChart } from '@/components/admin/charts'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

export async function LojaSection({ tenantId, periodo }: { tenantId: string; periodo: Periodo }) {
  const [resumo, maisVendidos, cupons]: [LojaVendasResumo, LojaMaisVendido[], LojaCupomUso[]] =
    await Promise.all([
      resumirVendasLoja(tenantId, periodo),
      listarMaisVendidosLoja(tenantId, periodo),
      resumirUsoCupons(tenantId, periodo),
    ])

  const vazio =
    resumo.atual.pedidos === 0 &&
    resumo.anterior.pedidos === 0 &&
    Object.keys(resumo.porStatus).length === 0

  const pendentes = resumo.porStatus.PENDENTE ?? 0

  return (
    <InsightSection
      title="Loja"
      description={`Pedidos confirmados/entregues — ${PERIODO_LABEL[periodo].toLowerCase()} vs período anterior.`}
    >
      {vazio ? (
        <div className="sm:col-span-2 lg:col-span-3">
          <MotionEmptyState
            title="Sem pedidos no período"
            description="Os pedidos da loja aparecem aqui assim que os associados comprarem."
          />
        </div>
      ) : (
        <>
          <StatCard
            label="Vendido no período"
            value={formatarMoedaBRL(resumo.atual.receita)}
            tone="success"
            delta={{ atual: resumo.atual.receita, anterior: resumo.anterior.receita }}
            href="/admin/loja/pedidos"
          />
          <StatCard
            label="Pedidos confirmados"
            value={resumo.atual.pedidos}
            delta={{ atual: resumo.atual.pedidos, anterior: resumo.anterior.pedidos }}
            href="/admin/loja/pedidos"
          />
          <StatCard
            label="Ticket médio"
            value={formatarMoedaBRL(resumo.atual.ticketMedio)}
            delta={{ atual: resumo.atual.ticketMedio, anterior: resumo.anterior.ticketMedio }}
          />

          <StatCard
            compact
            label="Aguardando confirmação"
            value={pendentes}
            tone={pendentes > 0 ? 'warning' : 'default'}
            href="/admin/loja/pedidos?status=PENDENTE"
          />
          <StatCard
            compact
            label="Entregues"
            value={resumo.porStatus.ENTREGUE ?? 0}
            tone="success"
          />
          <StatCard
            compact
            label="Cancelados"
            value={resumo.porStatus.CANCELADO ?? 0}
            tone={(resumo.porStatus.CANCELADO ?? 0) > 0 ? 'danger' : 'default'}
          />

          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
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

          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Cupons usados
            </h3>
            {cupons.length === 0 ? (
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Nenhum cupom usado no período.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {cupons.map((c) => (
                  <li key={c.codigo} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate font-mono font-semibold text-[rgb(var(--foreground))]">
                      {c.codigo}
                    </span>
                    <span className="shrink-0 text-[rgb(var(--foreground-muted))]">
                      {c.usos} uso{c.usos === 1 ? '' : 's'} ·{' '}
                      <span className="tabular-nums">−{formatarMoedaBRL(c.descontoTotal)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </InsightSection>
  )
}
