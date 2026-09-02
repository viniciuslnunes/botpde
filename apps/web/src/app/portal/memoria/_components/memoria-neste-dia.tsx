import Link from 'next/link'
import { History } from 'lucide-react'
import type { MemoriaEscopo } from '@torcida/types'
import type { MemoriaParalelo } from '@/lib/memoria-acervo'

type Props = {
  paralelos: MemoriaParalelo[]
  escopo: MemoriaEscopo
}

export function MemoriaNesteDia({ paralelos, escopo }: Props) {
  if (paralelos.length === 0) return null

  return (
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.55)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" aria-hidden />
        <h3 className="portal-kicker text-[rgb(var(--foreground))]">Neste dia</h3>
      </div>
      <ul className="space-y-2">
        {paralelos.map((p) => (
          <li key={p.dia}>
            <Link
              href={`/portal/memoria?escopo=${escopo}&dia=${p.dia}`}
              className="flex min-w-0 items-start gap-3 rounded-xl border border-[rgb(var(--border)_/_0.55)] bg-[rgb(var(--background)_/_0.35)] p-3 transition-colors hover:border-[rgb(var(--color-primary)_/_0.3)]"
            >
              <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-[rgb(var(--color-primary-fg))]">
                {p.anosAtras}a
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[rgb(var(--foreground-muted))]">
                  {p.dia}
                </span>
                <span className="mt-0.5 line-clamp-2 text-sm text-[rgb(var(--foreground))]">
                  {p.resumo}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
