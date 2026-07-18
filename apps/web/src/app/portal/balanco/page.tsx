import { redirect } from 'next/navigation'
import { Scale } from 'lucide-react'
import {
  CATEGORIA_FINANCEIRO_LABEL,
  formatarMoedaBRL,
} from '@torcida/types'
import { db } from '@torcida/db'
import type { BalancoDetalheNivel, TipoSede } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import {
  listarLancamentosBalanco,
  resumirFinanceiro,
  resumirFinanceiroPorCategoria,
} from '@/lib/financeiro'
import type { FinanceiroCategoriaResumo, FinanceiroResumo } from '@/lib/financeiro'
import { parseFiltroBalanco } from '@/lib/financeiro-filtros'
import { FinanceiroResumoCards } from '@/components/financeiro/financeiro-resumo-cards'
import { BalancoLancamentosLista } from '@/components/financeiro/balanco-lancamentos-lista'
import { BalancoPeriodoFiltros } from '@/components/financeiro/balanco-periodo-filtros'
import { BalancoAcoes } from '@/components/financeiro/balanco-acoes'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Balanço financeiro' }

function rotuloCategoria(categoria: string) {
  return CATEGORIA_FINANCEIRO_LABEL[categoria] ?? categoria
}

function rotuloTipoSede(tipo: TipoSede) {
  if (tipo === 'SEDE') return 'Sede'
  if (tipo === 'SUBSEDE') return 'Subsede'
  return 'PDE'
}

function rotuloPeriodo(dataDe?: string, dataAte?: string): string {
  if (!dataDe && !dataAte) return 'Todo o período'
  if (dataDe && dataAte && dataDe === dataAte) {
    const [y, m, d] = dataDe.split('-')
    return `${d}/${m}/${y}`
  }
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }
  if (dataDe && dataAte) return `${fmt(dataDe)} — ${fmt(dataAte)}`
  if (dataDe) return `A partir de ${fmt(dataDe)}`
  return `Até ${fmt(dataAte!)}`
}

function montarTextoResumo(input: {
  tenantNome: string
  periodo: string
  resumo: FinanceiroResumo
  porCategoria: FinanceiroCategoriaResumo[]
  nivel: BalancoDetalheNivel
}): string {
  const linhas = [
    `Balanço financeiro — ${input.tenantNome}`,
    `Período: ${input.periodo}`,
    `Receitas: ${formatarMoedaBRL(input.resumo.totalReceitas)}`,
    `Despesas: ${formatarMoedaBRL(input.resumo.totalDespesas)}`,
    `Saldo: ${formatarMoedaBRL(input.resumo.saldo)}`,
    `Lançamentos: ${input.resumo.quantidade}`,
  ]
  if (input.nivel !== 'TOTAIS' && input.porCategoria.length > 0) {
    linhas.push('', 'Por categoria:')
    for (const row of input.porCategoria.slice(0, 8)) {
      linhas.push(
        `· ${rotuloCategoria(row.categoria)}: saldo ${formatarMoedaBRL(row.saldo)} (R ${formatarMoedaBRL(row.receitas)} / D ${formatarMoedaBRL(row.despesas)})`,
      )
    }
  }
  return linhas.join('\n')
}

type Props = {
  searchParams: Promise<{
    page?: string
    dataDe?: string
    dataAte?: string
    sedeId?: string
  }>
}

export default async function PortalBalancoPage({ searchParams }: Props) {
  const [session, tenant, sp] = await Promise.all([
    auth(),
    getTenantFromHost(),
    searchParams,
  ])
  if (!tenant) redirect('/')
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant.balancoFinanceiroVisivel) redirect('/portal')

  const nivel: BalancoDetalheNivel = tenant.balancoDetalheNivel ?? 'COMPLETO'
  const { filtro, values } = parseFiltroBalanco(sp)
  const filtroResumo = {
    dataDe: filtro.dataDe,
    dataAte: filtro.dataAte,
    sedeId: filtro.sedeId,
  }
  const periodoLabel = rotuloPeriodo(values.dataDe, values.dataAte)

  const unidadesRows: Array<{ id: string; nome: string; tipo: TipoSede }> = await db.sede.findMany({
    where: { tenantId: tenant.id, ativa: true },
    orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
    select: { id: true, nome: true, tipo: true },
  })
  const unidades = unidadesRows.map((u) => ({
    id: u.id,
    nome: u.nome,
    tipoLabel: rotuloTipoSede(u.tipo),
  }))

  const precisaCategorias = nivel === 'CATEGORIAS' || nivel === 'COMPLETO'
  const precisaLancamentos = nivel === 'COMPLETO'

  const [resumo, porCategoria, lista]: [
    FinanceiroResumo,
    FinanceiroCategoriaResumo[],
    Awaited<ReturnType<typeof listarLancamentosBalanco>> | null,
  ] = await Promise.all([
    resumirFinanceiro(tenant.id, filtroResumo),
    precisaCategorias
      ? resumirFinanceiroPorCategoria(tenant.id, filtroResumo)
      : Promise.resolve([]),
    precisaLancamentos
      ? listarLancamentosBalanco(tenant.id, { filtro })
      : Promise.resolve(null),
  ])

  const textoResumo = montarTextoResumo({
    tenantNome: tenant.nome,
    periodo: periodoLabel,
    resumo,
    porCategoria,
    nivel,
  })

  return (
    <div className="balanco-print-root mx-auto max-w-4xl space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .balanco-print-root, .balanco-print-root * { visibility: visible; }
          .balanco-print-root { position: absolute; left: 0; top: 0; width: 100%; max-width: none; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      <MotionReveal>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
                Balanço financeiro
              </h1>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Prestação de contas — {periodoLabel}
              </p>
            </div>
          </div>
          <BalancoAcoes textoResumo={textoResumo} />
        </div>
      </MotionReveal>

      <MotionReveal index={1}>
        <BalancoPeriodoFiltros values={values} unidades={unidades} />
      </MotionReveal>

      <MotionReveal index={2}>
        <FinanceiroResumoCards
          totalReceitas={resumo.totalReceitas}
          totalDespesas={resumo.totalDespesas}
          saldo={resumo.saldo}
        />
      </MotionReveal>

      {precisaCategorias && porCategoria.length > 0 && (
        <MotionReveal index={3}>
          <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
            <div className="border-b border-[rgb(var(--border))] px-4 py-3">
              <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">
                Por categoria
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-[rgb(var(--border))] text-xs uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                    <th className="px-4 py-2.5 font-semibold">Categoria</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Receitas</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Despesas</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--border))]">
                  {porCategoria.map((row) => (
                    <tr key={row.categoria}>
                      <td className="px-4 py-3 font-medium text-[rgb(var(--foreground))]">
                        {rotuloCategoria(row.categoria)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatarMoedaBRL(row.receitas)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-600 dark:text-red-400">
                        {formatarMoedaBRL(row.despesas)}
                      </td>
                      <td
                        className={[
                          'px-4 py-3 text-right font-semibold tabular-nums',
                          row.saldo >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400',
                        ].join(' ')}
                      >
                        {formatarMoedaBRL(row.saldo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </MotionReveal>
      )}

      {precisaLancamentos && lista && (
        <MotionReveal index={4}>
          <BalancoLancamentosLista
            itens={lista.itens}
            total={lista.total}
            page={lista.page}
            pageSize={lista.pageSize}
            query={values}
          />
        </MotionReveal>
      )}

      {nivel === 'TOTAIS' && (
        <p className="no-print text-center text-xs text-[rgb(var(--foreground-muted))]">
          A torcida publicou só os totais. Detalhe por categoria e lançamentos ficam no Financeiro.
        </p>
      )}
      {nivel === 'CATEGORIAS' && (
        <p className="no-print text-center text-xs text-[rgb(var(--foreground-muted))]">
          Lançamentos individuais não estão no balanço público — consulte o livro-caixa se tiver
          permissão.
        </p>
      )}
    </div>
  )
}
