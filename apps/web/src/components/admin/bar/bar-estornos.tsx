import { Undo2 } from 'lucide-react'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'

export type BarEstornoItem = {
  id: string
  totalLabel: string
  metodoLabel: string
  operadorNome: string
  estornadoPorNome: string | null
  motivo: string | null
  criadoEmLabel: string
  estornadoEmLabel: string | null
}

export type BarEstornoOperadorItem = {
  operadorId: string
  operadorNome: string
  quantidade: number
  valorLabel: string
  anomalo: boolean
}

export type BarEstornoProdutoItem = {
  produtoId: string | null
  produtoNome: string
  quantidade: number
  valorLabel: string
}

export function BarEstornosResumo({
  porOperador,
  porProduto,
}: {
  porOperador: BarEstornoOperadorItem[]
  porProduto: BarEstornoProdutoItem[]
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h2 className="font-semibold text-[rgb(var(--foreground))]">Por operador</h2>
        {porOperador.length === 0 ? (
          <p className="text-sm text-[rgb(var(--foreground-muted))]">Sem estornos no período.</p>
        ) : (
          <ul className="space-y-2">
            {porOperador.map((op) => (
              <li key={op.operadorId} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
                    {op.operadorNome}
                  </p>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    {op.quantidade} estorno{op.quantidade !== 1 ? 's' : ''} · {op.valorLabel}
                  </p>
                </div>
                {op.anomalo && (
                  <span className="shrink-0 rounded-full bg-[rgb(var(--color-danger)_/_0.14)] px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--color-danger-fg))]">
                    Padrão anômalo
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h2 className="font-semibold text-[rgb(var(--foreground))]">Por produto</h2>
        {porProduto.length === 0 ? (
          <p className="text-sm text-[rgb(var(--foreground-muted))]">Sem estornos no período.</p>
        ) : (
          <ul className="space-y-2">
            {porProduto.map((p) => (
              <li key={p.produtoId ?? p.produtoNome} className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">{p.produtoNome}</p>
                <p className="shrink-0 text-xs text-[rgb(var(--foreground-muted))]">
                  {p.quantidade} un. · {p.valorLabel}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export function BarEstornosTabela({ estornos }: { estornos: BarEstornoItem[] }) {
  if (estornos.length === 0) {
    return (
      <MotionEmptyState
        icon={<Undo2 className="mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]" />}
        title="Nenhum estorno no período"
        description="Vendas estornadas nos últimos 30 dias aparecem aqui, com quem estornou e o motivo."
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[rgb(var(--border))] py-16 text-center"
      />
    )
  }

  return (
    <ul className="divide-y divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      {estornos.map((e) => (
        <li key={e.id} className="space-y-1 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-[rgb(var(--foreground))]">
              {e.totalLabel} · {e.metodoLabel}
            </p>
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              {e.criadoEmLabel}
              {e.estornadoEmLabel ? ` → estornado em ${e.estornadoEmLabel}` : ''}
            </p>
          </div>
          <p className="text-xs text-[rgb(var(--foreground-muted))]">
            Operador original: {e.operadorNome} · Estornado por: {e.estornadoPorNome ?? '—'}
          </p>
          {e.motivo && (
            <p className="text-xs text-[rgb(var(--foreground-muted))]">Motivo: {e.motivo}</p>
          )}
        </li>
      ))}
    </ul>
  )
}
