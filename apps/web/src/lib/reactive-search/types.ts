import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Opção exibida no dropdown de busca reativa. */
export type ReactiveSearchOption = {
  id: string
  label: string
  sublabel?: string | null
  searchText?: string
  thumbUrl?: string | null
  /** Elemento à esquerda — substitui thumb/ícone padrão. */
  leading?: ReactNode
  disabled?: boolean
  /** Dado opaco repassado em callbacks de seleção — não entra na busca. */
  payload?: unknown
}

export const REACTIVE_SEARCH_DEBOUNCE_MS = 220
export const REACTIVE_SEARCH_MAX_SUGESTOES = 12

export type ReactiveSearchMode = 'filter' | 'pick'

export type UseReactiveSearchConfig = {
  mode: ReactiveSearchMode
  /** Texto digitado (modo filter) ou query interna (modo pick). */
  query: string
  onQueryChange: (query: string) => void
  /** Semente / universo local. */
  items?: ReactiveSearchOption[]
  /** Busca remota com debounce — `items` vira semente. */
  onSearch?: (term: string) => Promise<ReactiveSearchOption[]>
  minChars?: number
  maxResults?: number
  debounceMs?: number
  /** Modo pick: id selecionado. */
  valueId?: string | null
  disabled?: boolean
}

export type ReactiveSearchState = {
  aberto: boolean
  destaque: number
  opcoes: ReactiveSearchOption[]
  universo: ReactiveSearchOption[]
  truncado: boolean
  totalOcultos: number
  buscandoRemoto: boolean
  temDropdown: boolean
  selecionado: ReactiveSearchOption | null
  mostrarLista: boolean
}

export type ReactiveSearchHandlers = {
  setAberto: (aberto: boolean) => void
  setDestaque: (index: number) => void
  onFocus: () => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  selecionar: (item: ReactiveSearchOption) => void
  limparQuery: () => void
}

export type UseReactiveSearchResult = ReactiveSearchState &
  ReactiveSearchHandlers & {
    rootRef: RefObject<HTMLDivElement | null>
    inputRef: RefObject<HTMLInputElement | null>
    listId: string
    inputId: string
  }

/** Props compartilhadas pelos componentes de UI. */
export type ReactiveSearchUiBase = {
  placeholder: string
  ariaLabel?: string
  label?: string
  disabled?: boolean
  fallbackIcon?: LucideIcon
  emptyMessage?: string
  noResultsMessage?: string
  className?: string
  inputClassName?: string
  minChars?: number
  maxResults?: number
  debounceMs?: number
  /** Integração com `<form>` (listagens admin). */
  name?: string
  inputRef?: RefObject<HTMLInputElement | null>
  /** Loading externo (ex.: navegação de listagem). */
  loading?: boolean
  /** `sm` para admin/listagens; `md` (default) para portal. */
  size?: 'sm' | 'md'
}
