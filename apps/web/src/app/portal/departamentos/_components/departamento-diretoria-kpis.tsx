import Link from 'next/link'
import { Clock, CreditCard, UserCheck, UserX } from 'lucide-react'

export type DiretoriaKpis = {
  pendentes: number
  aprovados: number
  reprovados: number
  sociosAtivos: number
  carteirinhasVencidas: number
}

function Kpi({
  label,
  value,
  href,
  accent,
  icon: Icon,
}: {
  label: string
  value: number
  href?: string
  accent?: boolean
  icon: typeof Clock
}) {
  const body = (
    <div
      className={[
        'rounded-xl border px-3 py-3',
        accent
          ? 'border-amber-300/60 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
          : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 text-[rgb(var(--foreground-muted))]">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p
        className={[
          'mt-1 text-2xl font-bold tabular-nums',
          accent ? 'text-amber-800 dark:text-amber-200' : 'text-[rgb(var(--foreground))]',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  )

  if (!href) return body
  if (href.startsWith('#')) {
    return (
      <a href={href} className="block transition-opacity hover:opacity-90">
        {body}
      </a>
    )
  }
  return (
    <Link href={href} prefetch={false} className="block transition-opacity hover:opacity-90">
      {body}
    </Link>
  )
}

export function DepartamentoDiretoriaKpis({ kpis }: { kpis: DiretoriaKpis }) {
  return (
    <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Visão rápida</h2>
      <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
        Base associativa da torcida — números ao vivo.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Kpi
          label="Pendentes"
          value={kpis.pendentes}
          accent={kpis.pendentes > 0}
          icon={Clock}
          href={kpis.pendentes > 0 ? '#fila' : undefined}
        />
        <Kpi
          label="Ativos"
          value={kpis.aprovados}
          icon={UserCheck}
          href="/admin/torcedores?status=APROVADO"
        />
        <Kpi
          label="Reprovados"
          value={kpis.reprovados}
          icon={UserX}
          href="/admin/torcedores?status=REPROVADO"
        />
        <Kpi
          label="Carteirinhas"
          value={kpis.sociosAtivos}
          icon={CreditCard}
          href="/admin/socios"
        />
      </div>
      {kpis.carteirinhasVencidas > 0 && (
        <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
          {kpis.carteirinhasVencidas} carteirinha
          {kpis.carteirinhasVencidas === 1 ? '' : 's'} vencida
          {kpis.carteirinhasVencidas === 1 ? '' : 's'}
        </p>
      )}
    </section>
  )
}
