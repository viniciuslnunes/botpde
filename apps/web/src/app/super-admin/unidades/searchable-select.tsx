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
 * Sem dependência externa.
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
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-left text-sm text-[rgb(var(--foreground))] outline-none hover:border-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary))] disabled:opacity-50"
        >
          <span className="min-w-0 truncate">
            {selected.label}
            {selected.sublabel ? (
              <span className="ml-1.5 text-xs text-[rgb(var(--foreground-muted))]">{selected.sublabel}</span>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Limpar seleção"
              className="rounded p-0.5 text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
              }}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <ChevronsUpDown className="h-4 w-4 text-[rgb(var(--foreground-muted))]" aria-hidden />
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 focus-within:border-[rgb(var(--color-primary))]">
          <Search className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
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
            // Sem role explícito o input é `textbox`, que não suporta
            // aria-expanded — o par input + listbox é um combobox.
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            className="min-w-0 flex-1 bg-transparent text-sm text-[rgb(var(--foreground))] outline-none placeholder:text-[rgb(var(--foreground-muted))] disabled:opacity-50"
          />
        </div>
      )}

      {open && (
        <div
          id={listId}
          role="listbox"
          className="app-scrollbar-fina absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-xl"
        >
          {filtered.itens.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[rgb(var(--foreground-muted))]">{emptyText}</p>
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
                      ativo
                        ? 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]'
                        : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
                    ].join(' ')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{o.label}</span>
                      {o.sublabel ? (
                        <span
                          className={[
                            'block truncate text-xs',
                            ativo ? 'text-[rgb(var(--color-primary-fg))]' : 'text-[rgb(var(--foreground-muted))]',
                          ].join(' ')}
                        >
                          {o.sublabel}
                        </span>
                      ) : null}
                    </span>
                    {ativo ? <Check className="h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" /> : null}
                  </button>
                )
              })}
              {filtered.total > filtered.itens.length && (
                <p className="px-3 py-1.5 text-xs text-[rgb(var(--foreground-muted))]">
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
