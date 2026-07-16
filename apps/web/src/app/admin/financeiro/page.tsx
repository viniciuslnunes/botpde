import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { formatDataCompetenciaInput, PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import {
  listarLancamentosFinanceiro,
  resumirFinanceiro,
} from '@/lib/financeiro'
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
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Financeiro — Admin' }

type Props = { searchParams: Promise<FinanceiroSearchParams> }

export default async function FinanceiroAdminPage({ searchParams }: Props) {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.FINANCE_MANAGE))
  } catch {
    redirect('/admin')
  }

  const sp = await searchParams
  const { filtro, values } = parseFiltroFinanceiro(sp)
  const { page: _page, ...filtroResumo } = filtro

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
          <Link
            href="/portal/financeiro"
            className="text-sm font-medium text-[rgb(var(--primary))] hover:underline"
          >
            Ver no portal
          </Link>
        </div>
      </MotionReveal>

      <FinanceiroResumoCards
        totalReceitas={resumo.totalReceitas}
        totalDespesas={resumo.totalDespesas}
        saldo={resumo.saldo}
      />

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
