'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CalendarDays, MessageSquareText, Search, X } from 'lucide-react'
import { normalizarTexto } from '@/lib/onboarding-unidade'

const MAX_SUGESTOES = 12

export type MemoriaVinculoItem = {
  id: string
  label: string
  sublabel?: string | null
  searchText?: string
  thumbUrl?: string | null
}

type Props = {
  label: string
  placeholder: string
  emptyMessage: string
  items: MemoriaVinculoItem[]
  valueId: string | null
  onChange: (id: string | null) => void
  kind: 'evento' | 'publicacao'
  disabled?: boolean
}

export function MemoriaVinculoPicker({
  label,
  placeholder,
  emptyMessage,
  items,
  valueId,
  onChange,
  kind,
  disabled = false,
}: Props) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [aberto, setAberto] = useState(false)
  const [query, setQuery] = useState('')
  const [destaque, setDestaque] = useState(0)

  const selecionado = useMemo(
    () => items.find((i) => i.id === valueId) ?? null,
    [items, valueId],
  )

  const alvoBusca = normalizarTexto(query)

  const sugestoes = useMemo(() => {
    const filtradas = items.filter((item) => {
      if (!alvoBusca) return true
      const hay = item.searchText ?? [item.label, item.sublabel ?? ''].join(' ')
      return normalizarTexto(hay).includes(alvoBusca)
    })
    return filtradas.slice(0, MAX_SUGESTOES)
  }, [items, alvoBusca])

  useEffect(() => {
    if (!aberto) return
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [aberto])

  useEffect(() => {
    setDestaque(0)
  }, [alvoBusca, aberto])

  function limpar() {
    onChange(null)
    setQuery('')
    setAberto(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function selecionar(item: MemoriaVinculoItem) {
    onChange(item.id)
    setQuery(item.label)
    setAberto(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!aberto && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setAberto(true)
      return
    }
    if (!aberto) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setDestaque((i) => Math.min(i + 1, Math.max(sugestoes.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setDestaque((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && sugestoes[destaque]) {
      e.preventDefault()
      selecionar(sugestoes[destaque]!)
    } else if (e.key === 'Escape') {
      setAberto(false)
    }
  }

  const Icon = kind === 'evento' ? CalendarDays : MessageSquareText

  return (
    <div ref={rootRef} className="relative block text-sm">
      <span className="mb-1 block text-xs text-[rgb(var(--foreground-muted))]">{label}</span>

      {selecionado ? (
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-2.5 py-2">
          {selecionado.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selecionado.thumbUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--background))] text-[rgb(var(--foreground-muted))]">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
              {selecionado.label}
            </p>
            {selecionado.sublabel ? (
              <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">
                {selecionado.sublabel}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={limpar}
            aria-label="Remover vínculo"
            className="app-touch-target flex shrink-0 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background))] hover:text-[rgb(var(--foreground))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--foreground-muted))]"
              aria-hidden
            />
            <input
              ref={inputRef}
              id={`${listId}-input`}
              type="search"
              disabled={disabled}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setAberto(true)
              }}
              onFocus={() => setAberto(true)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              autoComplete="off"
              role="combobox"
              aria-expanded={aberto}
              aria-controls={`${listId}-list`}
              aria-autocomplete="list"
              className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] py-2 pl-9 pr-3 text-base text-[rgb(var(--foreground))] outline-none placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--primary))] disabled:opacity-60"
            />
          </div>

          {aberto ? (
            <ul
              id={`${listId}-list`}
              role="listbox"
              className="app-scrollbar-fina absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
            >
              {sugestoes.length === 0 ? (
                <li className="px-3 py-2.5 text-sm text-[rgb(var(--foreground-muted))]">
                  {items.length === 0 ? emptyMessage : 'Nenhum resultado — tente outro termo.'}
                </li>
              ) : (
                sugestoes.map((item, i) => (
                  <li key={item.id} role="option" aria-selected={i === destaque}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        selecionar(item)
                      }}
                      onMouseEnter={() => setDestaque(i)}
                      className={[
                        'flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left transition-colors',
                        i === destaque
                          ? 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]'
                          : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
                      ].join(' ')}
                    >
                      {item.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.thumbUrl}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]">
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.label}</span>
                        {item.sublabel ? (
                          <span className="block truncate text-xs text-[rgb(var(--foreground-muted))]">
                            {item.sublabel}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </>
      )}
    </div>
  )
}
