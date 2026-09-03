import { redirect } from 'next/navigation'
import { db } from '@torcida/db'
import {
  formatDataCompetenciaInput,
  isDepartamentoLegado,
  PERMISSIONS,
  STATUS_PROJETO_ABERTOS,
} from '@torcida/types'
import { assertManageOrOversightView } from '@/lib/authz'
import { listarLancamentosFinanceiro, resumirFinanceiro } from '@/lib/financeiro'
import { AdminCreateDisclosure } from '@/components/admin/ui'
import {
  parseFiltroFinanceiro,
  type FinanceiroSearchParams,
} from '@/lib/financeiro-filtros'
import {
  FinanceiroLancamentoForm,
  type RateioOpcoes,
} from '@/components/financeiro/financeiro-lancamento-form'
import {
  FinanceiroLancamentosLista,
  type LancamentoRow,
} from '@/components/financeiro/financeiro-lancamentos-lista'
import { FinanceiroResumoCards } from '@/components/financeiro/financeiro-resumo-cards'
import { FinanceiroFiltros } from '@/components/financeiro/financeiro-filtros'
import { ExportarFinanceiroButton } from '@/components/financeiro/exportar-financeiro-button'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { listarEventosParaRateio } from '@/lib/financeiro-operacao'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Lançamentos — Financeiro' }

const BASE = '/admin/financeiro/lancamentos'

type Props = { searchParams: Promise<FinanceiroSearchParams> }

export default async function FinanceiroLancamentosPage({ searchParams }: Props) {
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
  const { filtro, values } = parseFiltroFinanceiro(sp)
  const filtroResumo = { ...filtro }
  delete filtroResumo.page

  const [resumo, lista] = await Promise.all([
    resumirFinanceiro(tenant.id, filtroResumo),
    listarLancamentosFinanceiro(tenant.id, { filtro }),
  ])

  let rateio: RateioOpcoes | undefined
  if (podeGerir) {
    const [departamentos, projetos, eventos]: [
      Array<{ id: string; nome: string; slug: string }>,
      Array<{ id: string; titulo: string; departamentoId: string }>,
      Awaited<ReturnType<typeof listarEventosParaRateio>>,
    ] = await Promise.all([
      db.departamento.findMany({
        where: { tenantId: tenant.id },
        orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
        select: { id: true, nome: true, slug: true },
      }),
      db.projeto.findMany({
        where: { tenantId: tenant.id, status: { in: [...STATUS_PROJETO_ABERTOS] } },
        orderBy: { titulo: 'asc' },
        take: 200,
        select: { id: true, titulo: true, departamentoId: true },
      }),
      listarEventosParaRateio(tenant.id),
    ])
    rateio = {
      departamentos: departamentos
        .filter((d) => !isDepartamentoLegado(d))
        .map((d) => ({ id: d.id, nome: d.nome })),
      projetos,
      eventos,
    }
  }

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
            {podeGerir
              ? 'Operação do livro-caixa — criar, editar e excluir lançamentos.'
              : 'Somente leitura — lançamentos do livro-caixa.'}
          </p>
          <ExportarFinanceiroButton />
        </div>
      </MotionReveal>

      <FinanceiroResumoCards
        totalReceitas={resumo.totalReceitas}
        totalDespesas={resumo.totalDespesas}
        saldo={resumo.saldo}
      />

      <FinanceiroFiltros basePath={BASE} values={values} />
      {podeGerir ? (
        <AdminCreateDisclosure label="Novo lançamento">
          <FinanceiroLancamentoForm rateio={rateio} />
        </AdminCreateDisclosure>
      ) : null}
      <FinanceiroLancamentosLista
        itens={itens}
        podeGerir={podeGerir}
        total={lista.total}
        page={lista.page}
        pageSize={lista.pageSize}
        basePath={BASE}
        query={values}
      />
    </div>
  )
}
