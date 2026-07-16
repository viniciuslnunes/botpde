import { formatarMoedaBRL } from '@torcida/types'

export function FinanceiroResumoCards({
  totalReceitas,
  totalDespesas,
  saldo,
}: {
  totalReceitas: number
  totalDespesas: number
  saldo: number
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <ResumoCard label="Receitas" value={formatarMoedaBRL(totalReceitas)} tone="pos" />
      <ResumoCard label="Despesas" value={formatarMoedaBRL(totalDespesas)} tone="neg" />
      <ResumoCard
        label="Saldo"
        value={formatarMoedaBRL(saldo)}
        tone={saldo >= 0 ? 'pos' : 'neg'}
      />
    </div>
  )
}

function ResumoCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'pos' | 'neg'
}) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
        {label}
      </p>
      <p
        className={[
          'mt-1 text-lg font-bold tabular-nums',
          tone === 'pos'
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-red-600 dark:text-red-400',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  )
}
