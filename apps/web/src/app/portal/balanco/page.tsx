import { redirect } from 'next/navigation'
import { Scale } from 'lucide-react'
import { CATEGORIA_FINANCEIRO_LABEL, formatarMoedaBRL } from '@torcida/types'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { resumirFinanceiro, resumirFinanceiroPorCategoria } from '@/lib/financeiro'
import type { FinanceiroCategoriaResumo, FinanceiroResumo } from '@/lib/financeiro'
import { FinanceiroResumoCards } from '@/components/financeiro/financeiro-resumo-cards'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Balanço financeiro' }

function rotuloCategoria(categoria: string) {
  return CATEGORIA_FINANCEIRO_LABEL[categoria] ?? categoria
}

export default async function PortalBalancoPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!tenant) redirect('/')
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant.balancoFinanceiroVisivel) redirect('/portal')

  const [resumo, porCategoria]: [FinanceiroResumo, FinanceiroCategoriaResumo[]] = await Promise.all(
    [resumirFinanceiro(tenant.id), resumirFinanceiroPorCategoria(tenant.id)],
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <MotionReveal>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Balanço financeiro</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Totais da torcida — sem detalhe de lançamentos individuais.
            </p>
          </div>
        </div>
      </MotionReveal>

      <MotionReveal index={1}>
        <FinanceiroResumoCards
          totalReceitas={resumo.totalReceitas}
          totalDespesas={resumo.totalDespesas}
          saldo={resumo.saldo}
        />
      </MotionReveal>

      <MotionReveal index={2}>
        {porCategoria.length === 0 ? (
          <MotionEmptyState
            icon={<Scale className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
            title="Ainda sem movimentos"
            description="Quando houver receitas e despesas no livro-caixa, os totais por categoria aparecem aqui."
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center"
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
            <div className="border-b border-[rgb(var(--border))] px-4 py-3">
              <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Por categoria</h2>
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
        )}
      </MotionReveal>
    </div>
  )
}
