import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export type ProximaAcaoArea = {
  titulo: string
  descricao: string
  href: string
  cta: string
} | null

export function DepartamentoProximaAcao({ acao }: { acao: ProximaAcaoArea }) {
  if (!acao) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--primary)_/_0.25)] bg-[rgb(var(--primary)_/_0.06)] px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--primary))]">
          Próxima ação
        </p>
        <p className="text-sm font-semibold text-[rgb(var(--foreground))]">{acao.titulo}</p>
        <p className="text-xs text-[rgb(var(--foreground-muted))]">{acao.descricao}</p>
      </div>
      <Link
        href={acao.href}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        {acao.cta}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
