'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Calendar } from 'lucide-react'
import { TIPO_EVENTO_LABEL } from '@torcida/types'
import { SearchFilterInput, type ReactiveSearchOption } from '@/components/ui/reactive-search'
import {
  buscarEventosAgendaAction,
  type AgendaTypeaheadHit,
} from '@/lib/eventos-agenda-busca'
import { hrefAdminEvento } from '@/lib/eventos-admin-href'

/**
 * Busca por título com debounce — troca `?q=` sem scroll, e mostra
 * correspondências no dropdown (mesma inteligência das outras buscas).
 */
export function AgendaBusca({
  defaultValue = '',
  placeholder = 'Buscar título…',
  className,
}: {
  defaultValue?: string
  placeholder?: string
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(defaultValue)
  const [sincronizado, setSincronizado] = useState(defaultValue)
  const [pending, startTransition] = useTransition()
  const admin = pathname.startsWith('/admin')
  const tipoFiltro = searchParams.get('tipo')

  if (defaultValue !== sincronizado) {
    setSincronizado(defaultValue)
    setValue(defaultValue)
  }

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

  async function buscarEventos(termo: string): Promise<ReactiveSearchOption[]> {
    const hits = await buscarEventosAgendaAction({
      termo,
      tipo: tipoFiltro,
      admin,
    })
    return hits.map(hitParaOpcao)
  }

  function irParaEvento(item: ReactiveSearchOption) {
    const hit = item.payload as AgendaTypeaheadHit
    const href = admin
      ? hrefAdminEvento({
          id: hit.id,
          tipo: hit.tipo,
          departamentoSlug: hit.departamentoSlug,
        })
      : `/portal/eventos/${hit.id}`
    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <SearchFilterInput
      value={value}
      onChange={setValue}
      placeholder={placeholder}
      ariaLabel="Buscar eventos"
      onSearch={buscarEventos}
      onSelectSuggestion={irParaEvento}
      minChars={1}
      loading={pending}
      fallbackIcon={Calendar}
      noResultsMessage="Nenhum evento com esse título."
      emptyMessage="Digite para buscar eventos."
      className={['min-w-0 flex-1', className].filter(Boolean).join(' ')}
      inputClassName="rounded-lg focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)]"
    />
  )
}

function hitParaOpcao(hit: AgendaTypeaheadHit): ReactiveSearchOption {
  return {
    id: hit.id,
    label: hit.titulo,
    sublabel: [TIPO_EVENTO_LABEL[hit.tipo], hit.dataLabel, hit.local]
      .filter(Boolean)
      .join(' · '),
    searchText: [hit.titulo, hit.local].filter(Boolean).join(' '),
    thumbUrl: hit.fotoUrl,
    payload: hit,
  }
}
