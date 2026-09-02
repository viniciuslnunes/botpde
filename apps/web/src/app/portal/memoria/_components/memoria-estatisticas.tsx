import type { MemoriaEstatisticas } from '@/lib/memoria-acervo'

type Props = {
  stats: MemoriaEstatisticas
}

export function MemoriaEstatisticasBloco({ stats }: Props) {
  if (stats.diasComMemoria === 0) return null

  return (
    <div className="mb-3 rounded-xl border border-[rgb(var(--border)_/_0.55)] bg-[rgb(var(--background)_/_0.35)] px-3 py-2.5">
      <p className="portal-kicker mb-1.5 text-[rgb(var(--foreground-muted))]">Acervo</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div>
          <dt className="text-[rgb(var(--foreground-muted))]">Com memória</dt>
          <dd className="font-mono font-semibold tabular-nums text-[rgb(var(--foreground))]">
            {stats.diasComMemoria}
            <span className="font-normal text-[rgb(var(--foreground-muted))]">
              {' '}
              / {stats.diasNaJanela}
            </span>
          </dd>
        </div>
        {stats.mesMaisAtivo && (
          <div>
            <dt className="text-[rgb(var(--foreground-muted))]">Mês ativo</dt>
            <dd className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-[rgb(var(--foreground))]">
              {stats.mesMaisAtivo}
            </dd>
          </div>
        )}
        {stats.primeiroDia && (
          <div className="col-span-2">
            <dt className="text-[rgb(var(--foreground-muted))]">Mais antigo na janela</dt>
            <dd className="font-mono text-[11px] tabular-nums text-[rgb(var(--foreground))]">
              {stats.primeiroDia}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}
