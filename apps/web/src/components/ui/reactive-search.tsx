'use client'

import { useEffect, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { Loader2, Search, X, type LucideIcon } from 'lucide-react'
import {
  REACTIVE_SEARCH_DEBOUNCE_MS,
  REACTIVE_SEARCH_MAX_SUGESTOES,
  useReactiveSearch,
  type ReactiveSearchOption,
  type ReactiveSearchUiBase,
} from '@/lib/reactive-search'

export type { ReactiveSearchOption } from '@/lib/reactive-search'
export { filtrarOpcoesBusca, useReactiveSearchLocal } from '@/lib/reactive-search'

// ── Subcomponentes de UI ────────────────────────────────────────────────────

type ListaProps = {
  listId: string
  opcoes: ReactiveSearchOption[]
  destaque: number
  onDestaque: (index: number) => void
  onSelecionar: (item: ReactiveSearchOption) => void
  emptyMessage: string
  noResultsMessage: string
  temItensBase: boolean
  fallbackIcon?: LucideIcon
  valueId?: string | null
  truncado?: boolean
  totalOcultos?: number
}

function ReactiveSearchList({
  listId,
  opcoes,
  destaque,
  onDestaque,
  onSelecionar,
  emptyMessage,
  noResultsMessage,
  temItensBase,
  fallbackIcon: FallbackIcon,
  valueId,
  truncado,
  totalOcultos,
}: ListaProps) {
  return (
    <ul
      id={listId}
      role="listbox"
      className="app-scrollbar-fina absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
    >
      {opcoes.length === 0 ? (
        <li className="px-3 py-2.5 text-sm text-[rgb(var(--foreground-muted))]">
          {temItensBase ? noResultsMessage : emptyMessage}
        </li>
      ) : (
        <>
          {opcoes.map((item, i) => {
            const ativo = i === destaque
            const selecionado = valueId != null && item.id === valueId
            return (
              <li key={item.id} role="option" aria-selected={ativo || selecionado}>
                <ReactiveSearchOptionRow
                  item={item}
                  ativo={ativo || selecionado}
                  fallbackIcon={FallbackIcon}
                  onSelect={() => onSelecionar(item)}
                  onHover={() => onDestaque(i)}
                />
              </li>
            )
          })}
          {truncado && totalOcultos != null && totalOcultos > 0 ? (
            <li className="px-3 py-1.5 text-xs text-[rgb(var(--foreground-muted))]">
              +{totalOcultos} — refine a busca para ver mais
            </li>
          ) : null}
        </>
      )}
    </ul>
  )
}

function ReactiveSearchOptionRow({
  item,
  ativo,
  fallbackIcon: FallbackIcon,
  onSelect,
  onHover,
  size = 'md',
}: {
  item: ReactiveSearchOption
  ativo: boolean
  fallbackIcon?: LucideIcon
  onSelect: () => void
  onHover: () => void
  size?: 'sm' | 'md'
}) {
  const thumbClass = size === 'sm' ? 'h-8 w-8 rounded-md' : 'h-9 w-9 rounded-lg'
  return (
    <button
      type="button"
      disabled={item.disabled}
      onMouseDown={(e) => {
        e.preventDefault()
        onSelect()
      }}
      onMouseEnter={onHover}
      className={[
        'flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left transition-colors disabled:opacity-50',
        ativo
          ? 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]'
          : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
      ].join(' ')}
    >
      <ReactiveSearchLeading item={item} fallbackIcon={FallbackIcon} className={thumbClass} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.label}</span>
        {item.sublabel ? (
          <span className="block truncate text-xs text-[rgb(var(--foreground-muted))]">
            {item.sublabel}
          </span>
        ) : null}
      </span>
    </button>
  )
}

function ReactiveSearchLeading({
  item,
  fallbackIcon: FallbackIcon,
  className,
}: {
  item: ReactiveSearchOption
  fallbackIcon?: LucideIcon
  className: string
}) {
  if (item.leading) return <span className="shrink-0">{item.leading}</span>
  if (item.thumbUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.thumbUrl} alt="" className={`shrink-0 object-cover ${className}`} />
    )
  }
  if (!FallbackIcon) return null
  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))] ${className}`}
    >
      <FallbackIcon className="h-3.5 w-3.5" aria-hidden />
    </span>
  )
}

function ReactiveSearchLoadingList({ listId }: { listId: string }) {
  return (
    <ul
      id={listId}
      role="listbox"
      className="absolute z-30 mt-1 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
    >
      <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-[rgb(var(--foreground-muted))]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Buscando…
      </li>
    </ul>
  )
}

type InputShellProps = {
  inputId: string
  listId: string
  value: string
  onChange: (value: string) => void
  onFocus: (e: FocusEvent<HTMLInputElement>) => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  placeholder: string
  disabled?: boolean
  aberto: boolean
  carregando?: boolean
  /** Substitui o ícone de lupa (ex.: escudo do item selecionado). */
  leading?: ReactNode
  inputType?: 'search' | 'text'
  ariaActivedescendant?: string
  showClear?: boolean
  /** Mostra limpar mesmo com valor vazio. */
  forceClear?: boolean
  onClear?: () => void
  inputRef?: RefObject<HTMLInputElement | null>
  className?: string
  inputClassName?: string
  name?: string
  size?: 'sm' | 'md'
  onBlur?: () => void
  /** Sobrescreve aria-expanded (dropdown renderizado fora). */
  comboboxAberto?: boolean
  onPointerEnter?: (e: PointerEvent<HTMLInputElement>) => void
  onPointerLeave?: (e: PointerEvent<HTMLInputElement>) => void
}

function ReactiveSearchInputShell({
  inputId,
  listId,
  value,
  onChange,
  onFocus,
  onKeyDown,
  placeholder,
  disabled,
  aberto,
  carregando,
  showClear,
  forceClear,
  onClear,
  inputRef,
  className,
  inputClassName,
  name,
  size = 'md',
  onBlur,
  comboboxAberto,
  leading,
  inputType = 'search',
  ariaActivedescendant,
  onPointerEnter,
  onPointerLeave,
}: InputShellProps) {
  const Icone = carregando ? Loader2 : Search
  const textClass = size === 'sm' ? 'text-sm' : 'text-base'
  return (
    <div className={['relative', className].filter(Boolean).join(' ')}>
      {leading ? (
        <span className="pointer-events-none absolute left-2.5 top-1/2 flex -translate-y-1/2 items-center justify-center">
          {leading}
        </span>
      ) : (
        <Icone
          className={[
            'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
            carregando
              ? 'animate-spin text-[rgb(var(--color-primary-fg))]'
              : 'text-[rgb(var(--foreground-muted))]',
          ].join(' ')}
          aria-hidden
        />
      )}
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type={inputType}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={comboboxAberto ?? aberto}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={ariaActivedescendant}
        className={[
          'w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] py-2 outline-none placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--primary))] disabled:opacity-60 [&::-webkit-search-cancel-button]:hidden',
          leading ? 'pl-10' : 'pl-9',
          'pr-9',
          textClass,
          'text-[rgb(var(--foreground))]',
          inputClassName,
        ].join(' ')}
      />
      {showClear && (value || forceClear) ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Limpar busca"
          className="app-touch-target absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}

function ReactiveSearchSelectedChip({
  item,
  fallbackIcon,
  disabled,
  onClear,
}: {
  item: ReactiveSearchOption
  fallbackIcon?: LucideIcon
  disabled?: boolean
  onClear: () => void
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-2.5 py-2">
      <ReactiveSearchLeading item={item} fallbackIcon={fallbackIcon} className="h-9 w-9 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">{item.label}</p>
        {item.sublabel ? (
          <p className="truncate text-xs text-[rgb(var(--foreground-muted))]">{item.sublabel}</p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onClear}
        aria-label="Remover seleção"
        className="app-touch-target flex shrink-0 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background))] hover:text-[rgb(var(--foreground))]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── SearchPicker ────────────────────────────────────────────────────────────

export type SearchPickerProps = ReactiveSearchUiBase & {
  items: ReactiveSearchOption[]
  valueId: string | null
  onChange: (id: string | null) => void
  onSearch?: (term: string) => Promise<ReactiveSearchOption[]>
}

/** Combobox reativo — seleciona um item e exibe chip do escolhido. */
export function SearchPicker({
  label,
  placeholder,
  emptyMessage = 'Nada disponível.',
  noResultsMessage = 'Nenhum resultado — tente outro termo.',
  items,
  valueId,
  onChange,
  disabled = false,
  fallbackIcon,
  minChars = 0,
  maxResults = REACTIVE_SEARCH_MAX_SUGESTOES,
  debounceMs = REACTIVE_SEARCH_DEBOUNCE_MS,
  onSearch,
  className,
}: SearchPickerProps) {
  const [query, setQuery] = useState('')

  const busca = useReactiveSearch({
    mode: 'pick',
    query,
    onQueryChange: setQuery,
    items,
    onSearch,
    minChars,
    maxResults,
    debounceMs,
    valueId,
  })

  function limpar() {
    onChange(null)
    busca.limparQuery()
  }

  function selecionar(item: ReactiveSearchOption) {
    onChange(item.id)
    busca.selecionar(item)
  }

  return (
    <div
      ref={busca.rootRef}
      className={['relative block text-sm', className].filter(Boolean).join(' ')}
    >
      {label ? (
        <span className="mb-1 block text-xs text-[rgb(var(--foreground-muted))]">{label}</span>
      ) : null}

      {busca.selecionado ? (
        <ReactiveSearchSelectedChip
          item={busca.selecionado}
          fallbackIcon={fallbackIcon}
          disabled={disabled}
          onClear={limpar}
        />
      ) : (
        <>
          <ReactiveSearchInputShell
            inputId={busca.inputId}
            listId={busca.listId}
            inputRef={busca.inputRef}
            value={query}
            onChange={(next) => {
              setQuery(next)
              busca.setAberto(true)
            }}
            onFocus={busca.onFocus}
            onKeyDown={busca.onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            aberto={busca.aberto}
            carregando={busca.buscandoRemoto}
          />
          {busca.mostrarLista ? (
            <ReactiveSearchList
              listId={busca.listId}
              opcoes={busca.opcoes}
              destaque={busca.destaque}
              onDestaque={busca.setDestaque}
              onSelecionar={selecionar}
              emptyMessage={emptyMessage}
              noResultsMessage={noResultsMessage}
              temItensBase={busca.universo.length > 0}
              fallbackIcon={fallbackIcon}
              truncado={busca.truncado}
              totalOcultos={busca.totalOcultos}
            />
          ) : busca.buscandoRemoto ? (
            <ReactiveSearchLoadingList listId={busca.listId} />
          ) : null}
        </>
      )}
    </div>
  )
}

// ── SearchFilterInput ───────────────────────────────────────────────────────

export type SearchFilterInputProps = ReactiveSearchUiBase & {
  value: string
  onChange: (value: string) => void
  suggestions?: ReactiveSearchOption[]
  onSelectSuggestion?: (item: ReactiveSearchOption) => void
  onSearch?: (term: string) => Promise<ReactiveSearchOption[]>
  /** Limpar customizado (ex.: listagem com form submit). */
  onClear?: () => void
  /** Quando false, só o campo (sem listbox) — útil em modais com lista própria. */
  exibirDropdown?: boolean
  onBlur?: () => void
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  /** Id do listbox externo (painel customizado). */
  listboxId?: string
  /** Sobrescreve aria-expanded quando o dropdown é renderizado fora. */
  comboboxAberto?: boolean
  /** Mostra botão limpar mesmo com valor vazio (ex.: filtro `?raiz=`). */
  mostrarLimpar?: boolean
  /** Substitui o ícone de lupa à esquerda. */
  leading?: ReactNode
  inputType?: 'search' | 'text'
  inputId?: string
  ariaActivedescendant?: string
  onPointerEnter?: (e: PointerEvent<HTMLInputElement>) => void
  onPointerLeave?: (e: PointerEvent<HTMLInputElement>) => void
}

/** Campo de busca reativo — filtra listas ou busca no servidor com dropdown. */
export function SearchFilterInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  disabled,
  suggestions = [],
  onSelectSuggestion,
  minChars = 0,
  maxResults = REACTIVE_SEARCH_MAX_SUGESTOES,
  fallbackIcon,
  emptyMessage = 'Nada disponível.',
  noResultsMessage = 'Nenhum resultado — tente outro termo.',
  className,
  inputClassName,
  onSearch,
  debounceMs = REACTIVE_SEARCH_DEBOUNCE_MS,
  name,
  inputRef: inputRefExterno,
  loading,
  onClear: onClearCustom,
  size = 'md',
  exibirDropdown = true,
  onBlur,
  onFocus: onFocusExtra,
  onKeyDown: onKeyDownExtra,
  listboxId,
  comboboxAberto,
  mostrarLimpar,
  leading,
  inputType,
  inputId: inputIdExterno,
  ariaActivedescendant,
  onPointerEnter,
  onPointerLeave,
}: SearchFilterInputProps) {
  const busca = useReactiveSearch({
    mode: 'filter',
    query: value,
    onQueryChange: onChange,
    items: exibirDropdown ? suggestions : [],
    onSearch: exibirDropdown ? onSearch : undefined,
    minChars,
    maxResults,
    debounceMs,
  })

  const inputRef = inputRefExterno ?? busca.inputRef

  // Busca remota sem dropdown: dispara onSearch para efeito colateral (ex.: modal DM).
  useEffect(() => {
    if (exibirDropdown || !onSearch) return
    const termo = value.trim()
    if (termo.length < minChars) return
    const timer = window.setTimeout(() => {
      void onSearch(termo)
    }, debounceMs)
    return () => window.clearTimeout(timer)
  }, [exibirDropdown, onSearch, value, minChars, debounceMs])

  function selecionar(item: ReactiveSearchOption) {
    if (onSelectSuggestion) {
      onSelectSuggestion(item)
    } else {
      onChange(item.label)
    }
    busca.setAberto(false)
  }

  function limpar() {
    if (onClearCustom) {
      onClearCustom()
      return
    }
    busca.limparQuery()
  }

  const carregandoIcone = loading ?? busca.buscandoRemoto

  function handleFocus(e: FocusEvent<HTMLInputElement>) {
    busca.onFocus()
    onFocusExtra?.(e)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (exibirDropdown) busca.onKeyDown(e)
    onKeyDownExtra?.(e)
  }

  return (
    <div ref={busca.rootRef} className={['relative min-w-0', className].filter(Boolean).join(' ')}>
      <ReactiveSearchInputShell
        inputId={inputIdExterno ?? busca.inputId}
        listId={listboxId ?? busca.listId}
        inputRef={inputRef}
        name={name}
        value={value}
        onChange={(next) => {
          onChange(next)
          if (busca.temDropdown) busca.setAberto(true)
        }}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        placeholder={placeholder}
        disabled={disabled}
        aberto={busca.aberto}
        comboboxAberto={comboboxAberto}
        carregando={carregandoIcone}
        showClear
        forceClear={mostrarLimpar}
        onClear={limpar}
        inputClassName={inputClassName}
        size={size}
        leading={leading}
        inputType={inputType}
        ariaActivedescendant={ariaActivedescendant}
      />
      {ariaLabel && !inputIdExterno ? (
        <label htmlFor={busca.inputId} className="sr-only">
          {ariaLabel}
        </label>
      ) : null}
      {exibirDropdown && busca.buscandoRemoto && busca.temDropdown ? (
        <ReactiveSearchLoadingList listId={busca.listId} />
      ) : exibirDropdown && busca.mostrarLista ? (
        <ReactiveSearchList
          listId={busca.listId}
          opcoes={busca.opcoes}
          destaque={busca.destaque}
          onDestaque={busca.setDestaque}
          onSelecionar={selecionar}
          emptyMessage={emptyMessage}
          noResultsMessage={noResultsMessage}
          temItensBase={
            onSearch != null
              ? value.trim().length >= minChars && !busca.buscandoRemoto
              : busca.universo.length > 0
          }
          fallbackIcon={fallbackIcon}
        />
      ) : null}
    </div>
  )
}
