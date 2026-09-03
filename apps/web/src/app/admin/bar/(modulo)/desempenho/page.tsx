import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { PERMISSIONS } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import {
  listarMaisVendidosBar,
  resolveUnidadeBar,
  resumirConsumoEmAbertoBar,
  resumirMargemBar,
  resumirRecebidoBar,
  resumirVendasBarPorDia,
} from '@/lib/bar'
import type {
  BarConsumoEmAbertoResumo,
  BarMaisVendido,
  BarMargemResumo,
  BarVendasResumo,
} from '@/lib/bar'
import { carregarPrevisaoBar } from '@/lib/bar-previsao'
import {
  diasDoPeriodo,
  PERIODO_LABEL,
  PERIODO_LABEL_CURTO,
  PERIODO_PADRAO,
  type SerieTemporal,
} from '@/lib/admin-insights'
import { InsightSection, KpiGrid, StatCard } from '@/components/admin/ui'
import { MiniBarChart, Sparkline } from '@/components/admin/charts'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Desempenho — Bar Admin' }

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function InsightsSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-5 w-44 rounded-lg bg-[rgb(var(--border)_/_0.45)]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-40 rounded-2xl bg-[rgb(var(--border)_/_0.45)] sm:col-span-2" />
        <div className="h-40 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
      </div>
    </div>
  )
}

async function BarInsights({ tenantId, sedeId }: { tenantId: string; sedeId: string }) {
  const [serie, maisVendidos, consumoAberto]: [
    SerieTemporal,
    BarMaisVendido[],
    BarConsumoEmAbertoResumo,
  ] = await Promise.all([
    resumirVendasBarPorDia(tenantId, diasDoPeriodo(PERIODO_PADRAO), sedeId),
    listarMaisVendidosBar(tenantId, PERIODO_PADRAO, sedeId),
    resumirConsumoEmAbertoBar(tenantId, sedeId),
  ])

  const totalPeriodo = serie.reduce((acc, ponto) => acc + ponto.valor, 0)
  const periodoLabel = PERIODO_LABEL[PERIODO_PADRAO]

  return (
    <InsightSection
      title={periodoLabel}
      description="Recebido da unidade (venda rápida + pagamentos de comanda) e produtos mais consumidos."
    >
      {totalPeriodo === 0 && maisVendidos.length === 0 && consumoAberto.total === 0 ? (
        <div className="sm:col-span-2 lg:col-span-3">
          <MotionEmptyState
            title={`Sem movimento nos últimos ${PERIODO_LABEL_CURTO[PERIODO_PADRAO]}`}
            description="Registre vendas no PDV e feche comandas para acompanhar a evolução aqui."
          />
        </div>
      ) : (
        <>
          <StatCard
            label="Recebido no período"
            value={formatarPreco(totalPeriodo)}
            tone="success"
          />
          <StatCard
            label="Consumo em aberto"
            value={formatarPreco(consumoAberto.total)}
            tone={consumoAberto.total > 0 ? 'warning' : 'default'}
            badge={
              consumoAberto.quantidade > 0
                ? `${consumoAberto.quantidade} comanda${consumoAberto.quantidade === 1 ? '' : 's'}`
                : undefined
            }
            badgeTone="default"
            href="/admin/bar/comandas"
          />

          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Recebido por dia
              </h3>
              <p className="text-sm font-bold tabular-nums text-[rgb(var(--foreground))]">
                {formatarPreco(totalPeriodo)}
              </p>
            </div>
            <Sparkline data={serie.map((ponto) => ponto.valor)} width={280} height={48} className="h-12 w-full" />
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

async function BarPrevisaoJogo({ tenantId, sedeId }: { tenantId: string; sedeId: string }) {
  const previsao = await carregarPrevisaoBar(tenantId, sedeId)

  if (previsao.jogosBase === 0) {
    return (
      <InsightSection
        title="Previsão para o próximo jogo"
        description="Estimativa com base nos últimos jogos com venda no bar no mesmo dia do evento."
      >
        <div className="sm:col-span-2 lg:col-span-3">
          <MotionEmptyState
            title="Sem histórico de jogo"
            description="Vincule eventos a partidas e registre vendas no dia do jogo para gerar a previsão."
          />
        </div>
      </InsightSection>
    )
  }

  return (
    <InsightSection
      title="Previsão para o próximo jogo"
      description={
        previsao.proximaPartida
          ? `Média dos últimos ${previsao.jogosBase} jogos — próximo: vs ${previsao.proximaPartida.adversario}.`
          : `Média dos últimos ${previsao.jogosBase} jogos com movimento no bar.`
      }
    >
      {previsao.ruptura.length > 0 ? (
        <StatCard
          label="Risco de ruptura"
          value={previsao.ruptura.length}
          tone="warning"
          badge="itens abaixo da previsão"
          badgeTone="default"
          href="/admin/bar/estoque"
        />
      ) : (
        <StatCard label="Risco de ruptura" value={0} tone="success" />
      )}

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Itens mais demandados
        </h3>
        {previsao.itens.length === 0 ? (
          <p className="text-sm text-[rgb(var(--foreground-muted))]">Sem produtos recorrentes no histórico.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {previsao.itens.slice(0, 6).map((item) => (
              <li key={item.produtoId} className="flex items-center justify-between gap-3">
                <span className="truncate text-[rgb(var(--foreground))]">{item.nome}</span>
                <span className="shrink-0 tabular-nums text-[rgb(var(--foreground-muted))]">
                  ~{item.mediaUnidades} un.
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {previsao.ruptura.length > 0 ? (
        <div className="rounded-2xl border border-[rgb(var(--color-warning)_/_0.35)] bg-[rgb(var(--color-warning)_/_0.08)] p-4 sm:p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-warning-fg))]">
            Repor antes do jogo
          </h3>
          <ul className="space-y-1.5 text-sm text-[rgb(var(--foreground))]">
            {previsao.ruptura.map((item) => (
              <li key={item.produtoId}>
                {item.nome}: faltam ~{item.falta} (estoque {item.estoque})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </InsightSection>
  )
}

export default async function AdminBarDesempenhoPage() {
  let session: Awaited<ReturnType<typeof assertAnyPermission>>['session']
  let tenant: Awaited<ReturnType<typeof assertAnyPermission>>['tenant']
  try {
    ;({ session, tenant } = await assertAnyPermission([
      PERMISSIONS.BAR_MANAGE,
      PERMISSIONS.FINANCE_VIEW,
    ]))
  } catch {
    redirect('/admin/bar')
  }

  const unidade = await resolveUnidadeBar(tenant.id, session.user.id!)

  const inicioDoDia = new Date()
  inicioDoDia.setHours(0, 0, 0, 0)

  const [margemHoje, recebidoHoje, consumoAberto]: [
    BarMargemResumo,
    BarVendasResumo,
    BarConsumoEmAbertoResumo,
  ] = await Promise.all([
    resumirMargemBar(tenant.id, unidade.id, { desde: inicioDoDia }),
    resumirRecebidoBar(tenant.id, unidade.id, { desde: inicioDoDia }),
    resumirConsumoEmAbertoBar(tenant.id, unidade.id),
  ])

  return (
    <>
      <MotionReveal>
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Hoje
          </h2>
          <KpiGrid cols={4}>
            <StatCard label="Recebido" value={formatarPreco(recebidoHoje.totalPago)} tone="success" />
            <StatCard
              label="Consumo em aberto"
              value={formatarPreco(consumoAberto.total)}
              tone={consumoAberto.total > 0 ? 'warning' : 'default'}
            />
            <StatCard
              label="Consumo (margem)"
              value={formatarPreco(margemHoje.receita)}
              badge="PAGA + EM_COMANDA"
              badgeTone="default"
            />
            <StatCard
              label="Margem estimada"
              value={formatarPreco(margemHoje.margem)}
              tone={margemHoje.margem >= 0 ? 'success' : 'danger'}
              badge={`${margemHoje.quantidadeVendas} lançamento${
                margemHoje.quantidadeVendas === 1 ? '' : 's'
              }`}
              badgeTone="default"
            />
          </KpiGrid>
        </section>
      </MotionReveal>

      <Suspense fallback={<InsightsSkeleton />}>
        <BarInsights tenantId={tenant.id} sedeId={unidade.id} />
      </Suspense>

      <Suspense fallback={<InsightsSkeleton />}>
        <BarPrevisaoJogo tenantId={tenant.id} sedeId={unidade.id} />
      </Suspense>
    </>
  )
}
