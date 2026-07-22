import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Wallet } from 'lucide-react'
import {
  CATEGORIA_FINANCEIRO_LABEL,
  formatDataCompetenciaInput,
  formatarMoedaBRL,
  PERMISSIONS,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import {
  compararFinanceiroPeriodo,
  listarLancamentosFinanceiro,
  resumirFinanceiro,
  resumirFinanceiroMensal,
  resumirFinanceiroPorCategoria,
  type FinanceiroCategoriaResumo,
  type FinanceiroMensal,
  type FinanceiroResumo,
} from '@/lib/financeiro'
import { InsightSection, StatCard } from '@/components/admin/ui'
import { DonutChart, MiniBarChart } from '@/components/admin/charts'
import {
  parseFiltroFinanceiro,
  type FinanceiroSearchParams,
} from '@/lib/financeiro-filtros'
import { FinanceiroLancamentoForm } from '@/components/financeiro/financeiro-lancamento-form'
import {
  FinanceiroLancamentosLista,
  type LancamentoRow,
} from '@/components/financeiro/financeiro-lancamentos-lista'
import { FinanceiroResumoCards } from '@/components/financeiro/financeiro-resumo-cards'
import { FinanceiroFiltros } from '@/components/financeiro/financeiro-filtros'
import { ExportarFinanceiroButton } from '@/components/financeiro/exportar-financeiro-button'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Financeiro — Admin' }

type Props = { searchParams: Promise<FinanceiroSearchParams> }

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

async function FinanceiroInsights({ tenantId }: { tenantId: string }) {
  const doze = ultimosDozeMesesFiltro()
  const [mensal, comparativo, categorias]: [
    FinanceiroMensal[],
    { atual: FinanceiroResumo; anterior: FinanceiroResumo },
    FinanceiroCategoriaResumo[],
  ] = await Promise.all([
    resumirFinanceiroMensal(tenantId, 12),
    compararFinanceiroPeriodo(tenantId, '30d'),
    resumirFinanceiroPorCategoria(tenantId, doze),
  ])

  const temMovimento = mensal.some((m) => m.receitas > 0 || m.despesas > 0)
  if (!temMovimento) return null

  return (
    <InsightSection
      title="Evolução financeira"
      description="Receitas × despesas dos últimos 12 meses e saldo dos últimos 30 dias."
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
        label="Saldo (últimos 30 dias)"
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

/** Filtro dataDe/dataAte cobrindo os últimos 12 meses (competência local). */
function ultimosDozeMesesFiltro(): { dataDe: string; dataAte: string } {
  const agora = new Date()
  const inicio = new Date(agora.getFullYear(), agora.getMonth() - 11, 1)
  return {
    dataDe: formatDataCompetenciaInput(inicio),
    dataAte: formatDataCompetenciaInput(agora),
  }
}

export default async function FinanceiroAdminPage({ searchParams }: Props) {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE))
  } catch {
    redirect('/admin')
  }

  const sp = await searchParams
  const { filtro, values } = parseFiltroFinanceiro(sp)
  const filtroResumo = { ...filtro }
  delete filtroResumo.page

  const [resumo, lista] = await Promise.all([
    resumirFinanceiro(tenant.id, filtroResumo),
    listarLancamentosFinanceiro(tenant.id, { filtro }),
  ])

  const itens: LancamentoRow[] = lista.itens.map((l) => ({
    id: l.id,
    tipo: l.tipo,
    categoria: l.categoria,
    valor: Number(l.valor),
    descricao: l.descricao,
    data: formatDataCompetenciaInput(l.data),
    observacao: l.observacao,
    criadoPorNome: l.criadoPor.nome,
  }))

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <MotionReveal>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[rgb(var(--foreground))]">Financeiro</h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Operação do livro-caixa — criar, editar e excluir lançamentos.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportarFinanceiroButton />
            <Link
              href="/portal/financeiro"
              className="text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
            >
              Ver no portal
            </Link>
          </div>
        </div>
      </MotionReveal>

      <FinanceiroResumoCards
        totalReceitas={resumo.totalReceitas}
        totalDespesas={resumo.totalDespesas}
        saldo={resumo.saldo}
      />

      <Suspense fallback={<InsightsSkeleton />}>
        <FinanceiroInsights tenantId={tenant.id} />
      </Suspense>

      <FinanceiroFiltros basePath="/admin/financeiro" values={values} />
      <FinanceiroLancamentoForm />
      <FinanceiroLancamentosLista
        itens={itens}
        podeGerir
        total={lista.total}
        page={lista.page}
        pageSize={lista.pageSize}
        basePath="/admin/financeiro"
        query={values}
      />
    </div>
  )
}
