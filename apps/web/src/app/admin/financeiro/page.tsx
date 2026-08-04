import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  CreditCard,
  ListChecks,
  PiggyBank,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { formatarMoedaBRL, PERMISSIONS } from '@torcida/types'
import { assertManageOrOversightView } from '@/lib/authz'
import { carregarDirecaoFinanceiro } from '@/lib/financeiro-direcao'
import {
  AdminInboxList,
  DirecaoInboxSkeleton,
  DirecaoKpisSkeleton,
  InsightSection,
  KpiGrid,
  SincronizarCobrancasButton,
  StatCard,
} from '@/components/admin/ui'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Direção — Financeiro' }

type Props = {
  searchParams: Promise<{
    tab?: string
    tipo?: string
    categoria?: string
    q?: string
    dataDe?: string
    dataAte?: string
    page?: string
    sedeId?: string
  }>
}

/** Deep links antigos da raiz apontavam para o livro-caixa. */
function qsLancamentos(sp: Awaited<Props['searchParams']>): string {
  const params = new URLSearchParams()
  for (const key of ['tipo', 'categoria', 'q', 'dataDe', 'dataAte', 'page', 'sedeId'] as const) {
    const v = sp[key]
    if (v) params.set(key, v)
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

async function FinanceiroKpis({ tenantId }: { tenantId: string }) {
  const direcao = await carregarDirecaoFinanceiro(tenantId)
  const { inadimplencia } = direcao
  return (
    <>
      <KpiGrid cols={4}>
        <StatCard
          label="Em atraso"
          value={inadimplencia.quantidade}
          badge={formatarMoedaBRL(inadimplencia.valor)}
          badgeTone={inadimplencia.quantidade > 0 ? 'danger' : 'default'}
          tone={inadimplencia.quantidade > 0 ? 'danger' : 'default'}
          icon={<CreditCard className="h-5 w-5" />}
          href="/admin/financeiro/cobrancas?status=VENCIDA"
        />
        <StatCard
          label="D+7 ou mais"
          value={inadimplencia.d7Quantidade}
          badge="Cobranças vencidas há 7+ dias"
          badgeTone={inadimplencia.d7Quantidade > 0 ? 'warning' : 'default'}
          tone={inadimplencia.d7Quantidade > 0 ? 'warning' : 'default'}
          icon={<AlertTriangle className="h-5 w-5" />}
          href="/admin/financeiro/cobrancas?status=VENCIDA"
        />
        <StatCard
          label="Saldo 7 dias"
          value={formatarMoedaBRL(direcao.saldo7d)}
          tone={direcao.saldo7d < 0 ? 'danger' : 'default'}
          icon={<Wallet className="h-5 w-5" />}
          href="/admin/financeiro/lancamentos"
        />
        <StatCard
          label="Saldo 30 dias"
          value={formatarMoedaBRL(direcao.saldo30d)}
          tone={direcao.saldo30d < 0 ? 'warning' : 'default'}
          icon={<PiggyBank className="h-5 w-5" />}
          href="/admin/financeiro/evolucao"
        />
      </KpiGrid>
      {inadimplencia.taxa != null ? (
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          Taxa de inadimplência (90d):{' '}
          <span className="font-medium text-[rgb(var(--foreground))]">
            {Math.round(inadimplencia.taxa * 100)}%
          </span>
        </p>
      ) : null}
    </>
  )
}

async function FinanceiroInbox({
  tenantId,
  podeGerir,
}: {
  tenantId: string
  podeGerir: boolean
}) {
  const { pendencias, projetosAlerta } = await carregarDirecaoFinanceiro(tenantId)
  return (
    <>
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
              Precisa de você
            </h2>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              Inbox do tesoureiro — atraso, projetos e rateio incompleto.
            </p>
          </div>
          {podeGerir ? (
            <Link
              href="/admin/financeiro/cobrancas?status=VENCIDA"
              className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              Abrir cobranças
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
        <AdminInboxList
          itens={pendencias}
          podeAgir={podeGerir}
          emptyTitle="Nada urgente no caixa."
          emptyDescription="Sem cobranças vencidas, orçamentos estourados ou despesas órfãs recentes."
        />
      </section>

      {projetosAlerta.length > 0 ? (
        <InsightSection
          title="Projetos com orçamento estourado"
          description="Gasto realizado no livro-caixa passou do previsto do projeto."
        >
          <ul className="divide-y divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
            {projetosAlerta.map((p) => (
              <li key={p.id}>
                <Link
                  href={p.href}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-[rgb(var(--background-subtle))]"
                >
                  <span className="text-sm font-medium text-[rgb(var(--foreground))]">
                    {p.titulo}
                  </span>
                  <span className="text-xs text-[rgb(var(--color-danger-fg))]">
                    {p.percentual}% · {formatarMoedaBRL(p.realizado)} /{' '}
                    {formatarMoedaBRL(p.previsto)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </InsightSection>
      ) : null}
    </>
  )
}

export default async function FinanceiroDirecaoPage({ searchParams }: Props) {
  let tenant: Awaited<ReturnType<typeof assertManageOrOversightView>>['tenant']
  let podeGerir = false
  try {
    ;({ tenant, podeGerir } = await assertManageOrOversightView(
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.FINANCE_VIEW,
    ))
  } catch {
    redirect('/admin')
  }

  const sp = await searchParams
  if (sp.tab === 'evolucao') redirect('/admin/financeiro/evolucao')
  if (sp.tipo || sp.categoria || sp.q || sp.dataDe || sp.dataAte || sp.page || sp.sedeId) {
    redirect(`/admin/financeiro/lancamentos${qsLancamentos(sp)}`)
  }

  return (
    <div className="space-y-6">
      <MotionReveal>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            {podeGerir
              ? 'O que precisa da sua atenção hoje — cobranças, caixa e orçamentos.'
              : 'Visão de leitura do posto de comando financeiro.'}
          </p>
          {podeGerir ? <SincronizarCobrancasButton /> : null}
        </div>
      </MotionReveal>

      <Suspense fallback={<DirecaoKpisSkeleton cols={4} />}>
        <FinanceiroKpis tenantId={tenant.id} />
      </Suspense>

      <Suspense fallback={<DirecaoInboxSkeleton />}>
        <FinanceiroInbox tenantId={tenant.id} podeGerir={podeGerir} />
      </Suspense>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/financeiro/lancamentos"
          className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2.5 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--primary)_/_0.45)]"
        >
          <ListChecks className="h-4 w-4" aria-hidden />
          Livro-caixa
        </Link>
        <Link
          href="/admin/financeiro/evolucao"
          className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2.5 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--primary)_/_0.45)]"
        >
          <TrendingUp className="h-4 w-4" aria-hidden />
          Evolução
        </Link>
        <Link
          href="/admin/financeiro/planos"
          className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2.5 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--primary)_/_0.45)]"
        >
          <CreditCard className="h-4 w-4" aria-hidden />
          Planos
        </Link>
      </div>
    </div>
  )
}
