'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition, useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'

/** Busca rápida no chrome — GET no catálogo da loja atual. */
export function LojaChromeSearch({ tenantId }: { tenantId: string }) {
  const sp = useSearchParams()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const urlQ = sp.get('q') ?? ''
  const [q, setQ] = useState(urlQ)
  // Ressincroniza com a URL durante o render (padrão oficial do React para
  // "ajustar estado quando uma prop muda"): em effect, o input pisca com o
  // termo antigo por um frame depois de navegar.
  const [urlQSincronizado, setUrlQSincronizado] = useState(urlQ)
  if (urlQ !== urlQSincronizado) {
    setUrlQSincronizado(urlQ)
    setQ(urlQ)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams(sp.toString())
    const term = q.trim()
    if (term) params.set('q', term)
    else params.delete('q')
    params.delete('page')
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `/portal/loja/${tenantId}?${qs}` : `/portal/loja/${tenantId}`)
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="order-last w-full basis-full md:order-none md:min-w-0 md:flex-1 md:basis-auto"
      role="search"
    >
      <label htmlFor="loja-chrome-q" className="sr-only">
        Buscar na loja
      </label>
      <div className="relative w-full md:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgb(var(--foreground-muted))]" />
        <input
          id="loja-chrome-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar produto…"
          disabled={pending}
          className="w-full border-0 border-b border-[rgb(var(--border))] bg-transparent py-1.5 pl-8 pr-2 font-mono text-xs tracking-wide text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--primary))] focus:outline-none"
        />
      </div>
    </form>
  )
}
