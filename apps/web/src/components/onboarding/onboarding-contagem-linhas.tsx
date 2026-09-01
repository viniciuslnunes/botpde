import { formatContagem } from '@/lib/format-contagem'

export function ContagemComOnline({ total, online }: { total: number; online: number }) {
  if (online <= 0) {
    return <span>{formatContagem(total)}</span>
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0">
      <span>{formatContagem(total)}</span>
      <span className="text-[rgb(var(--foreground-muted))]" aria-hidden>
        ·
      </span>
      <span className="inline-flex items-center gap-1 text-success">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--color-success))] shadow-[0_0_6px_rgb(16_185_129_/_0.55)]"
          aria-hidden
        />
        <span>{formatContagem(online)} online</span>
      </span>
    </span>
  )
}

export function LinhaPlataforma({ rotulo, total, online }: { rotulo: string; total: number; online: number }) {
  return (
    <span className="min-h-[14px] text-[10px] text-[rgb(var(--foreground-muted))]">
      {rotulo}{' '}
      <span className="text-[rgb(var(--foreground))]">
        <ContagemComOnline total={total} online={online} />
      </span>
    </span>
  )
}
