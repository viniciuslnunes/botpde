import { STATUS_PATRIMONIO_LABEL } from '@torcida/types'
import type { PatrimonioResumo } from '@/lib/patrimonio'
import { KpiGrid, StatCard } from '@/components/admin/ui'

export function PatrimonioResumoCards({ resumo }: { resumo: PatrimonioResumo }) {
  return (
    <KpiGrid className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard compact label="Ativos (qtde)" value={String(resumo.totalAtivos)} />
      <StatCard
        compact
        label={STATUS_PATRIMONIO_LABEL.DISPONIVEL}
        value={String(resumo.disponiveis)}
        tone="success"
      />
      <StatCard compact label={STATUS_PATRIMONIO_LABEL.EM_USO} value={String(resumo.emUso)} />
      <StatCard
        compact
        label={STATUS_PATRIMONIO_LABEL.MANUTENCAO}
        value={String(resumo.manutencao)}
        tone="warning"
      />
    </KpiGrid>
  )
}
