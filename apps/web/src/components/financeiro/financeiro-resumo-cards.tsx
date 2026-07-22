import { formatarMoedaBRL } from '@torcida/types'
import { KpiGrid, StatCard } from '@/components/admin/ui'

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
    <KpiGrid className="grid gap-3 sm:grid-cols-3">
      <StatCard compact label="Receitas" value={formatarMoedaBRL(totalReceitas)} tone="success" />
      <StatCard compact label="Despesas" value={formatarMoedaBRL(totalDespesas)} tone="danger" />
      <StatCard
        compact
        label="Saldo"
        value={formatarMoedaBRL(saldo)}
        tone={saldo >= 0 ? 'success' : 'danger'}
      />
    </KpiGrid>
  )
}
