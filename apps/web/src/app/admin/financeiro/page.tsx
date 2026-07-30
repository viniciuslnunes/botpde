import { redirect } from 'next/navigation'
import { formatDataCompetenciaInput, PERMISSIONS } from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { listarLancamentosFinanceiro, resumirFinanceiro } from '@/lib/financeiro'
import { AdminCreateDisclosure } from '@/components/admin/ui'
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

type Props = { searchParams: Promise<FinanceiroSearchParams & { tab?: string }> }

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

  // Deep link antigo `?tab=evolucao` virou rota própria.
  if (sp.tab === 'evolucao') redirect('/admin/financeiro/evolucao')

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
    <div className="space-y-6">
      <MotionReveal>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Operação do livro-caixa — criar, editar e excluir lançamentos.
          </p>
          <ExportarFinanceiroButton />
        </div>
      </MotionReveal>

      <FinanceiroResumoCards
        totalReceitas={resumo.totalReceitas}
        totalDespesas={resumo.totalDespesas}
        saldo={resumo.saldo}
      />

      <FinanceiroFiltros basePath="/admin/financeiro" values={values} />
      <AdminCreateDisclosure label="Novo lançamento">
        <FinanceiroLancamentoForm />
      </AdminCreateDisclosure>
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
