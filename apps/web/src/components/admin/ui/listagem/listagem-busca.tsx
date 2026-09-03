'use client'

import { useCallback, useRef, useState } from 'react'
import { PARAM_BUSCA } from '@/lib/listagem'
import { SearchFilterInput, type ReactiveSearchOption } from '@/components/ui/reactive-search'
import { useListagemFormNotificarCampo, useListagemFormPendente } from './listagem-form'

export interface ListagemBuscaProps {
  specId: string
  defaultValue: string
  placeholder: string
  ariaLabel: string
  /** Query dos filtros ativos (sem `q`) — preserva escopo da typeahead. */
  filtrosQuery?: string
}

/**
 * Campo de busca da listagem. Vive dentro de `ListagemForm`, que já cuida do
 * debounce e da navegação; aqui entram typeahead (dropdown) + valor sincronizado
 * com a URL.
 */
export function ListagemBusca({
  specId,
  defaultValue,
  placeholder,
  ariaLabel,
  filtrosQuery = '',
}: ListagemBuscaProps) {
  const pendente = useListagemFormPendente()
  const notificarCampo = useListagemFormNotificarCampo()
  const buscaSeq = useRef(0)
  const [valor, setValor] = useState(defaultValue)
  const [sincronizado, setSincronizado] = useState(defaultValue)
  if (defaultValue !== sincronizado) {
    setSincronizado(defaultValue)
    setValor(defaultValue)
  }

  function onValorChange(next: string) {
    setValor(next)
    notificarCampo?.(PARAM_BUSCA, next)
  }

  function limpar() {
    setValor('')
    notificarCampo?.(PARAM_BUSCA, '')
  }

  const buscarRemoto = useCallback(
    async (termo: string): Promise<ReactiveSearchOption[]> => {
      const q = termo.trim()
      if (!q) return []
      const seq = ++buscaSeq.current
      const qs = new URLSearchParams(filtrosQuery)
      qs.set(PARAM_BUSCA, q)
      const res = await fetch(
        `/api/admin/listagem/typeahead?spec=${encodeURIComponent(specId)}&${qs.toString()}`,
        { cache: 'no-store' },
      )
      if (seq !== buscaSeq.current) return []
      if (!res.ok) return []
      const data = (await res.json()) as {
        itens?: Array<{ id: string; label: string; sublabel?: string | null; searchText?: string }>
      }
      return (data.itens ?? []).map((item) => ({
        id: item.id,
        label: item.label,
        sublabel: item.sublabel,
        searchText: item.searchText,
      }))
    },
    [filtrosQuery, specId],
  )

  return (
    <SearchFilterInput
      className="min-w-0 flex-1 sm:max-w-sm"
      inputClassName="rounded-lg text-sm focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)]"
      value={valor}
      onChange={onValorChange}
      onSelectSuggestion={(item) => onValorChange(item.label)}
      onSearch={buscarRemoto}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      name={PARAM_BUSCA}
      loading={pendente}
      onClear={limpar}
      minChars={1}
      noResultsMessage="Nenhuma correspondência — Enter mantém a busca livre."
      size="sm"
    />
  )
}
