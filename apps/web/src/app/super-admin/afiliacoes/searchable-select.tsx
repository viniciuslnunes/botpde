'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'

export interface ComboOption {
  id: string
  label: string
  sublabel?: string
}

const MAX_VISIVEL = 40

/**
 * Combobox de busca (autocomplete) para listas grandes — filtragem client-side
 * por label/sublabel, fecha ao clicar fora, teto de resultados visíveis.
 * Estilo zinc (super-admin). Sem dependência externa.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  emptyText = 'Nada encontrado.',
}: {
  options: ComboOption[]
  value: string | null
  onChange: (id: string | null) => void
  placeholder: string
  disabled?: boolean
  emptyText?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            (o.sublabel ? o.sublabel.toLowerCase().includes(q) : false),
        )
      : options
    return { itens: base.slice(0, MAX_VISIVEL), total: base.length }
  }, [options, query])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function selecionar(id: string) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={wrapRef} className="relative">
      {selected && !open ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-left text-sm text-zinc-100 outline-none hover:border-zinc-600 focus:border-violet-500 disabled:opacity-50"
        >
          <span className="min-w-0 truncate">
            {selected.label}
            {selected.sublabel ? (
              <span className="ml-1.5 text-xs text-zinc-500">{selected.sublabel}</span>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <X
              className="h-4 w-4 text-zinc-500 hover:text-zinc-300"
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
              }}
            />
            <ChevronsUpDown className="h-4 w-4 text-zinc-500" />
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 focus-within:border-violet-500">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            type="text"
            value={query}
            disabled={disabled}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false)
                setQuery('')
              }
            }}
            aria-expanded={open}
            aria-controls={listId}
            className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600 disabled:opacity-50"
          />
        </div>
      )}

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
        >
          {filtered.itens.length === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-500">{emptyText}</p>
          ) : (
            <>
              {filtered.itens.map((o) => {
                const ativo = o.id === value
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={ativo}
                    onClick={() => selecionar(o.id)}
                    className={[
                      'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                      ativo ? 'bg-violet-950/60 text-violet-100' : 'text-zinc-200 hover:bg-zinc-800',
                    ].join(' ')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{o.label}</span>
                      {o.sublabel ? (
                        <span
                          className={[
                            'block truncate text-xs',
                            ativo ? 'text-violet-300' : 'text-zinc-500',
                          ].join(' ')}
                        >
                          {o.sublabel}
                        </span>
                      ) : null}
                    </span>
                    {ativo ? <Check className="h-4 w-4 shrink-0 text-violet-300" /> : null}
                  </button>
                )
              })}
              {filtered.total > filtered.itens.length && (
                <p className="px-3 py-1.5 text-xs text-zinc-600">
                  +{filtered.total - filtered.itens.length} — refine a busca para ver mais
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
