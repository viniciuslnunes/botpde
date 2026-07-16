import { STATUS_PATRIMONIO_LABEL } from '@torcida/types'
import type { PatrimonioResumo } from '@/lib/patrimonio'

export function PatrimonioResumoCards({ resumo }: { resumo: PatrimonioResumo }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card label="Ativos (qtde)" value={String(resumo.totalAtivos)} />
      <Card label={STATUS_PATRIMONIO_LABEL.DISPONIVEL} value={String(resumo.disponiveis)} tone="ok" />
      <Card label={STATUS_PATRIMONIO_LABEL.EM_USO} value={String(resumo.emUso)} />
      <Card label={STATUS_PATRIMONIO_LABEL.MANUTENCAO} value={String(resumo.manutencao)} tone="warn" />
    </div>
  )
}

function Card({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'ok' | 'warn'
}) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--foreground-muted))]">
        {label}
      </p>
      <p
        className={[
          'mt-1 text-lg font-bold tabular-nums',
          tone === 'ok'
            ? 'text-emerald-700 dark:text-emerald-400'
            : tone === 'warn'
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-[rgb(var(--foreground))]',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  )
}
