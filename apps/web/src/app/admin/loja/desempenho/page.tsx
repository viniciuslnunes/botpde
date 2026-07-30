import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { formatarMoedaBRL, PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import {
  listarMaisVendidosLoja,
  resumirUsoCupons,
  resumirVendasLoja,
  type LojaCupomUso,
  type LojaMaisVendido,
  type LojaVendasResumo,
} from '@/lib/loja-insights'
import { PERIODO_LABEL, PERIODO_PADRAO } from '@/lib/admin-insights'
import { InsightSection, StatCard } from '@/components/admin/ui'
import { MiniBarChart } from '@/components/admin/charts'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Desempenho — Loja Admin' }

function LojaInsightsSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-5 w-44 rounded-lg bg-[rgb(var(--border)_/_0.45)]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-[rgb(var(--border)_/_0.45)]" />
        ))}
      </div>
    </div>
  )
}

async function LojaInsights({ tenantId }: { tenantId: string }) {
  const [resumo, maisVendidos, cupons]: [LojaVendasResumo, LojaMaisVendido[], LojaCupomUso[]] =
    await Promise.all([
      resumirVendasLoja(tenantId, PERIODO_PADRAO),
      listarMaisVendidosLoja(tenantId, PERIODO_PADRAO),
      resumirUsoCupons(tenantId, PERIODO_PADRAO),
    ])

  const semMovimento =
    resumo.atual.pedidos === 0 &&
    resumo.anterior.pedidos === 0 &&
    Object.keys(resumo.porStatus).length === 0

  if (semMovimento) {
    return (
      <MotionEmptyState
        title="Sem vendas para analisar"
        description="Assim que a loja registrar pedidos, a evolução aparece aqui."
      />
    )
  }

  const pendentes = resumo.porStatus.PENDENTE ?? 0

  return (
    <InsightSection
      title={PERIODO_LABEL[PERIODO_PADRAO]}
      description="Pedidos confirmados/entregues vs período anterior."
    >
      <StatCard
        label="Vendido no período"
        value={formatarMoedaBRL(resumo.atual.receita)}
        tone="success"
        delta={{ atual: resumo.atual.receita, anterior: resumo.anterior.receita }}
        href="/admin/loja/pedidos"
      />
      <StatCard
        label="Pedidos pendentes"
        value={pendentes}
        tone={pendentes > 0 ? 'warning' : 'default'}
        href="/admin/loja/pedidos?status=PENDENTE"
      />
      <StatCard
        label="Ticket médio"
        value={formatarMoedaBRL(resumo.atual.ticketMedio)}
        delta={{ atual: resumo.atual.ticketMedio, anterior: resumo.anterior.ticketMedio }}
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
    </InsightSection>
  )
}

export default async function AdminLojaDesempenhoPage() {
  try {
    await assertPermission(PERMISSIONS.STORE_MANAGE)
  } catch {
    redirect('/admin/loja')
  }

  const tenant = await getTenantFromHost()
  if (!tenant) redirect('/')

  return (
    <Suspense fallback={<LojaInsightsSkeleton />}>
      <LojaInsights tenantId={tenant.id} />
    </Suspense>
  )
}
