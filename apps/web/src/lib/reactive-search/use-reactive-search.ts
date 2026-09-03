'use client'

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import {
  filtrarOpcoesBusca,
  mesclarUniversoBusca,
  resolverOpcoesVisiveis,
} from './filter'
import {
  REACTIVE_SEARCH_DEBOUNCE_MS,
  REACTIVE_SEARCH_MAX_SUGESTOES,
  type ReactiveSearchOption,
  type UseReactiveSearchConfig,
  type UseReactiveSearchResult,
} from './types'

export function useReactiveSearch({
  mode,
  query,
  onQueryChange,
  items = [],
  onSearch,
  minChars = 0,
  maxResults = REACTIVE_SEARCH_MAX_SUGESTOES,
  debounceMs = REACTIVE_SEARCH_DEBOUNCE_MS,
  valueId = null,
}: UseReactiveSearchConfig): UseReactiveSearchResult {
  const listId = useId()
  const inputId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const buscaSeq = useRef(0)

  const [aberto, setAberto] = useState(false)
  const [destaque, setDestaque] = useState(0)
  const [poolRemoto, setPoolRemoto] = useState<{ termo: string; itens: ReactiveSearchOption[] }>({
    termo: '',
    itens: [],
  })

  const termoBusca = query.trim()
  const termoRemoto = termoBusca.length >= minChars ? termoBusca : ''
  const buscandoRemoto =
    onSearch != null && termoRemoto !== '' && poolRemoto.termo !== termoRemoto

  const universo = useMemo(() => {
    if (!onSearch) return items
    if (poolRemoto.termo === termoRemoto) {
      return mesclarUniversoBusca(items, poolRemoto.itens)
    }
    return items
  }, [items, onSearch, poolRemoto, termoRemoto])

  const { opcoes, truncado, totalOcultos } = useMemo(() => {
    if (mode === 'filter' && !onSearch && items.length === 0) {
      return { opcoes: [], truncado: false, totalOcultos: 0 }
    }
    return resolverOpcoesVisiveis(universo, query, maxResults)
  }, [mode, onSearch, items.length, universo, query, maxResults])

  const selecionado = useMemo(() => {
    if (mode !== 'pick' || valueId == null) return null
    return (
      items.find((i) => i.id === valueId) ??
      poolRemoto.itens.find((i) => i.id === valueId) ??
      null
    )
  }, [mode, valueId, items, poolRemoto.itens])

  const temDropdown =
    mode === 'pick' || onSearch != null || items.length > 0

  useEffect(() => {
    if (!onSearch || !termoRemoto) return
    const seq = ++buscaSeq.current
    const timer = window.setTimeout(() => {
      void onSearch(termoRemoto)
        .then((itens) => {
          if (seq !== buscaSeq.current) return
          setPoolRemoto({ termo: termoRemoto, itens })
        })
        .catch(() => {
          if (seq !== buscaSeq.current) return
          setPoolRemoto({ termo: termoRemoto, itens: [] })
        })
    }, debounceMs)
    return () => window.clearTimeout(timer)
  }, [onSearch, termoRemoto, debounceMs])

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
  }, [query, aberto])

  function onFocus() {
    if (temDropdown && (termoBusca.length >= minChars || mode === 'pick')) {
      setAberto(true)
    }
  }

  function selecionar(item: ReactiveSearchOption) {
    if (mode === 'pick') {
      onQueryChange(item.label)
    }
    setAberto(false)
    return item
  }

  function limparQuery() {
    onQueryChange('')
    setAberto(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!temDropdown) return
    if (!aberto && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setAberto(true)
      return
    }
    if (!aberto) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setDestaque((i) => Math.min(i + 1, Math.max(opcoes.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setDestaque((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && opcoes[destaque]) {
      e.preventDefault()
      selecionar(opcoes[destaque]!)
    } else if (e.key === 'Escape') {
      setAberto(false)
    }
  }

  const mostrarLista =
    temDropdown &&
    aberto &&
    !buscandoRemoto &&
    (mode === 'pick'
      ? termoRemoto === '' || termoBusca.length >= minChars
      : query.length >= minChars && (opcoes.length > 0 || termoBusca.length >= minChars))

  return {
    aberto,
    destaque,
    opcoes,
    universo,
    truncado,
    totalOcultos,
    buscandoRemoto,
    temDropdown,
    selecionado,
    mostrarLista,
    setAberto,
    setDestaque,
    onFocus,
    onKeyDown,
    selecionar,
    limparQuery,
    rootRef,
    inputRef,
    listId,
    inputId,
  }
}

/** Atalho para montar sugestões a partir de uma lista já carregada. */
export function useReactiveSearchLocal(
  query: string,
  items: ReactiveSearchOption[],
  maxResults = REACTIVE_SEARCH_MAX_SUGESTOES,
): ReactiveSearchOption[] {
  return useMemo(
    () => filtrarOpcoesBusca(items, query, maxResults),
    [items, query, maxResults],
  )
}
