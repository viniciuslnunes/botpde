import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { PERMISSIONS } from '@torcida/types'
import { assertAnyPermission } from '@/lib/authz'
import {
  listarMaisVendidosBar,
  resolveUnidadeBar,
  resumirMargemBar,
  resumirVendasBarPorDia,
} from '@/lib/bar'
import type { BarMaisVendido, BarMargemResumo } from '@/lib/bar'
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
  const [serie, maisVendidos]: [SerieTemporal, BarMaisVendido[]] = await Promise.all([
    resumirVendasBarPorDia(tenantId, diasDoPeriodo(PERIODO_PADRAO), sedeId),
    listarMaisVendidosBar(tenantId, PERIODO_PADRAO, sedeId),
  ])

  const totalPeriodo = serie.reduce((acc, ponto) => acc + ponto.valor, 0)
  const periodoLabel = PERIODO_LABEL[PERIODO_PADRAO]

  return (
    <InsightSection
      title={periodoLabel}
      description="Vendas pagas da unidade e produtos que mais saíram."
    >
      {totalPeriodo === 0 && maisVendidos.length === 0 ? (
        <div className="sm:col-span-2 lg:col-span-3">
          <MotionEmptyState
            title={`Sem vendas nos últimos ${PERIODO_LABEL_CURTO[PERIODO_PADRAO]}`}
            description="Registre vendas no PDV para acompanhar a evolução da unidade aqui."
          />
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:col-span-2 sm:p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Vendas por dia
              </h3>
              <p className="text-sm font-bold tabular-nums text-[rgb(var(--foreground))]">
                {formatarPreco(totalPeriodo)}
              </p>
            </div>
            <Sparkline data={serie.map((ponto) => ponto.valor)} width={280} height={48} className="h-12 w-full" />
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

  const margemHoje: BarMargemResumo = await resumirMargemBar(tenant.id, unidade.id, {
    desde: inicioDoDia,
  })

  return (
    <>
      <MotionReveal>
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Hoje
          </h2>
          <KpiGrid cols={3}>
            <StatCard label="Receita" value={formatarPreco(margemHoje.receita)} />
            <StatCard label="CMV estimado" value={formatarPreco(margemHoje.custo)} />
            <StatCard
              label="Margem estimada"
              value={formatarPreco(margemHoje.margem)}
              tone={margemHoje.margem >= 0 ? 'success' : 'danger'}
              badge={`${margemHoje.quantidadeVendas} venda${
                margemHoje.quantidadeVendas === 1 ? '' : 's'
              } · custo médio dos itens`}
              badgeTone="default"
            />
          </KpiGrid>
        </section>
      </MotionReveal>

      <Suspense fallback={<InsightsSkeleton />}>
        <BarInsights tenantId={tenant.id} sedeId={unidade.id} />
      </Suspense>
    </>
  )
}
