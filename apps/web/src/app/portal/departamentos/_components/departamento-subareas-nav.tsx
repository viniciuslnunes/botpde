'use client'

import { useEffect, useState } from 'react'

export type SubareaNavItem = {
  id: string
  label: string
  href?: string | null
}

export function DepartamentoSubareasNav({ subareas }: { subareas: readonly SubareaNavItem[] }) {
  const [hash, setHash] = useState('')

  useEffect(() => {
    const sync = () => setHash(window.location.hash.replace(/^#/, ''))
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  if (subareas.length === 0) return null

  return (
    <div className="sticky top-0 z-10 -mx-1 bg-[rgb(var(--background)_/_0.92)] px-1 py-2 backdrop-blur-sm">
      <div className="relative">
        <nav
          aria-label="Subáreas"
          className="app-scrollbar-none flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {subareas.map((s) => {
            const isExternal = Boolean(s.href?.startsWith('/'))
            const href = isExternal ? (s.href as string) : `#${s.id}`
            const current = !isExternal && hash === s.id
            return (
              <a
                key={s.id}
                href={href}
                aria-current={current ? 'true' : undefined}
                className={[
                  'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  current
                    ? 'border-[rgb(var(--primary)_/_0.45)] bg-[rgb(var(--primary)_/_0.1)] text-[rgb(var(--primary))]'
                    : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--primary)_/_0.35)] hover:text-[rgb(var(--foreground))]',
                ].join(' ')}
              >
                {s.label}
              </a>
            )
          })}
        </nav>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[rgb(var(--background))] to-transparent sm:hidden"
        />
      </div>
    </div>
  )
}
