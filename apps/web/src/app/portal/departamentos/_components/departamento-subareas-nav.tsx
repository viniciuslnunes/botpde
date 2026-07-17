'use client'

export type SubareaNavItem = {
  id: string
  label: string
  href?: string | null
}

export function DepartamentoSubareasNav({ subareas }: { subareas: readonly SubareaNavItem[] }) {
  if (subareas.length === 0) return null

  return (
    <nav
      aria-label="Subáreas"
      className="app-scrollbar-none flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {subareas.map((s) => {
        const href = s.href?.startsWith('/') ? s.href : `#${s.id}`
        return (
          <a
            key={s.id}
            href={href}
            className="shrink-0 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--primary)_/_0.35)] hover:text-[rgb(var(--foreground))]"
          >
            {s.label}
          </a>
        )
      })}
    </nav>
  )
}
