import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Eye, Lock, Wallet } from 'lucide-react'
import type { Metadata } from 'next'
import { db } from '@torcida/db'
import { formatDataCompetenciaInput } from '@torcida/types'
import { assertPresidentePodeLerUnidade } from '@/lib/authz'
import { listarLancamentosFinanceiro, resumirFinanceiro } from '@/lib/financeiro'
import {
  parseFiltroFinanceiro,
  type FinanceiroSearchParams,
} from '@/lib/financeiro-filtros'
import {
  FinanceiroLancamentosLista,
  type LancamentoRow,
} from '@/components/financeiro/financeiro-lancamentos-lista'
import { FinanceiroResumoCards } from '@/components/financeiro/financeiro-resumo-cards'
import { MotionReveal } from '@/components/motion/motion-reveal'

export const metadata: Metadata = { title: 'Administração da unidade — Visão da torcida' }

type Props = {
  params: Promise<{ tenantId: string }>
  searchParams: Promise<FinanceiroSearchParams>
}

/**
 * Drill-down READ-ONLY do Presidente (R1) sobre uma unidade descendente
 * (Caso B — tenant próprio). Gate `assertPresidentePodeLerUnidade` garante no
 * SERVIDOR que o alvo é da árvore da Sede; nenhuma ação de mutação é montada
 * (loaders read-only + `podeGerir={false}`), e a própria action de mutação da
 * unidade re-checaria a permissão no tenant-filho (dupla camada). MVP: módulo
 * Financeiro. Eventos / Bar / Membros (com PII mascarada) entram na sequência.
 */
export default async function UnidadeAdminPage({ params, searchParams }: Props) {
  const { tenantId } = await params

  try {
    await assertPresidentePodeLerUnidade(tenantId)
  } catch {
    redirect('/admin/torcida')
  }

  const unidade: { nome: string } | null = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { nome: true },
  })
  if (!unidade) redirect('/admin/torcida')

  const sp = await searchParams
  const { filtro, values } = parseFiltroFinanceiro(sp)
  const filtroResumo = { ...filtro }
  delete filtroResumo.page

  const basePath = `/admin/torcida/unidade/${tenantId}`

  const [resumo, lista] = await Promise.all([
    resumirFinanceiro(tenantId, filtroResumo),
    listarLancamentosFinanceiro(tenantId, { filtro }),
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
    <div className="app-container space-y-7 py-8">
      <MotionReveal>
        <div className="space-y-3">
          <Link
            href="/admin/torcida"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Visão da torcida
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-primary-fg))]">
                Administração da unidade
              </p>
              <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">{unidade.nome}</h1>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2">
              <Lock className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
              <span className="text-xs text-[rgb(var(--foreground-muted))]">
                Somente leitura — a operação é da liderança da unidade
              </span>
            </div>
          </div>
        </div>
      </MotionReveal>

      <MotionReveal index={1}>
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Financeiro
            </h2>
          </div>

          <FinanceiroResumoCards
            totalReceitas={resumo.totalReceitas}
            totalDespesas={resumo.totalDespesas}
            saldo={resumo.saldo}
          />

          <FinanceiroLancamentosLista
            itens={itens}
            podeGerir={false}
            total={lista.total}
            page={lista.page}
            pageSize={lista.pageSize}
            basePath={basePath}
            query={values}
          />
        </section>
      </MotionReveal>

      <MotionReveal index={2}>
        <p className="flex items-center gap-1.5 text-xs text-[rgb(var(--foreground-muted))]">
          <Eye className="h-3.5 w-3.5" />
          Próximos módulos nesta visão: Eventos, Bar e Membros (dados sensíveis mascarados).
        </p>
      </MotionReveal>
    </div>
  )
}
