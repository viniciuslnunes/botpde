'use client'

import { useId, useRef, useState } from 'react'
import { SearchFilterInput, type ReactiveSearchOption } from '@/components/ui/reactive-search'
import type { MunicipioBrasil } from '@/lib/municipios-ibge'
import { buscarRegioesPorTexto } from './actions'

type Props = {
  value: { cidade: string; uf: string } | null
  onSelecionar: (m: MunicipioBrasil) => void
  disabled?: boolean
  id?: string
  'aria-describedby'?: string
  uf?: string
  placeholder?: string
}

function rotuloMunicipio(m: { cidade: string; uf: string }, ufFixa?: string): string {
  if (ufFixa) return m.cidade
  return `${m.cidade} · ${m.uf}`
}

/**
 * Combobox de município (cidade + UF) com busca reativa.
 * Só vale seleção de uma opção da lista — texto digitado que não vira seleção
 * é descartado no blur, voltando ao rótulo do `value` atual.
 */
export function ComboboxRegiao({
  value,
  onSelecionar,
  disabled,
  id = 'regiao',
  'aria-describedby': ariaDescribedBy,
  uf,
  placeholder = 'Busque sua cidade',
}: Props) {
  const listboxId = useId()
  const ufFiltro = uf?.trim().toUpperCase() || undefined
  const rotuloValue = value ? rotuloMunicipio(value, ufFiltro) : ''
  const [query, setQuery] = useState(rotuloValue)
  const [prevValue, setPrevValue] = useState(rotuloValue)
  const [erro, setErro] = useState<string | null>(null)
  const buscaSeq = useRef(0)

  if (rotuloValue !== prevValue) {
    setPrevValue(rotuloValue)
    setQuery(rotuloValue)
  }

  async function buscarMunicipios(termo: string): Promise<ReactiveSearchOption[]> {
    const seq = ++buscaSeq.current
    try {
      const lista = await buscarRegioesPorTexto(termo, ufFiltro)
      if (seq !== buscaSeq.current) return []
      const opcoes = ufFiltro ? lista.filter((m) => m.uf === ufFiltro) : lista
      setErro(null)
      return opcoes.map((m) => ({
        id: `${m.uf}-${m.cidade}`,
        label: rotuloMunicipio(m, ufFiltro),
        sublabel: ufFiltro ? m.uf : null,
        searchText: `${m.cidade} ${m.uf}`,
        payload: m satisfies MunicipioBrasil,
      }))
    } catch {
      if (seq !== buscaSeq.current) return []
      setErro('Não foi possível buscar cidades. Tente novamente.')
      return []
    }
  }

  function selecionar(item: ReactiveSearchOption) {
    const m = item.payload as MunicipioBrasil
    const rotulo = rotuloMunicipio(m, ufFiltro)
    setQuery(rotulo)
    setPrevValue(rotulo)
    onSelecionar(m)
  }

  function onBlur() {
    if (query !== rotuloValue) setQuery(rotuloValue)
  }

  const termoAtual = query.trim()
  const espelhaValue = value != null && termoAtual === rotuloMunicipio(value, ufFiltro)
  const minChars = espelhaValue ? 999 : 2

  return (
    <div className="relative">
      <SearchFilterInput
        value={query}
        onChange={setQuery}
        onBlur={onBlur}
        placeholder={placeholder}
        ariaLabel={ufFiltro ? `Cidade em ${ufFiltro}` : 'Sua cidade'}
        disabled={disabled}
        onSearch={buscarMunicipios}
        onSelectSuggestion={selecionar}
        minChars={minChars}
        emptyMessage={espelhaValue ? 'Digite para trocar de cidade' : 'Digite ao menos 2 letras'}
        noResultsMessage={
          ufFiltro
            ? `Nenhuma cidade em ${ufFiltro} com esse nome`
            : 'Nenhuma cidade encontrada'
        }
      />
      <input
        type="hidden"
        id={id}
        aria-describedby={ariaDescribedBy}
        value={value ? `${value.cidade}|${value.uf}` : ''}
        readOnly
        tabIndex={-1}
        aria-hidden
      />
      {erro ? (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{erro}</p>
      ) : null}
      {/* listboxId reservado para compatibilidade com testes de a11y futuros */}
      <span id={listboxId} className="sr-only" />
    </div>
  )
}
