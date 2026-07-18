'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Search } from 'lucide-react'

/**
 * Busca por título com debounce — troca `?q=` sem scroll.
 * Remonte com `key={q}` no pai quando a URL mudar de fora.
 */
export function AgendaBusca({
  defaultValue = '',
  placeholder = 'Buscar título…',
}: {
  defaultValue?: string
  placeholder?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(defaultValue)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = value.trim()
      const current = (searchParams.get('q') ?? '').trim()
      if (next === current) return
      const params = new URLSearchParams(searchParams.toString())
      if (next) params.set('q', next)
      else params.delete('q')
      const qs = params.toString()
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
      })
    }, 320)
    return () => window.clearTimeout(t)
  }, [value, pathname, router, searchParams])

  return (
    <label className="relative block sm:w-48">
      <Search
        className={[
          'pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2',
          pending ? 'text-[rgb(var(--primary))]' : 'text-[rgb(var(--foreground-muted))]',
        ].join(' ')}
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Buscar eventos"
        className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] py-1.5 pl-8 pr-3 text-sm text-[rgb(var(--foreground))]"
      />
    </label>
  )
}
