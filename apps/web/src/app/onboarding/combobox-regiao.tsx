'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { Input } from '@torcida/ui'
import type { MunicipioBrasil } from '@/lib/municipios-ibge'
import { buscarRegioesPorTexto } from './actions'

const DEBOUNCE_MS = 200

type Props = {
  value: { cidade: string; uf: string } | null
  onSelecionar: (m: MunicipioBrasil) => void
  disabled?: boolean
  id?: string
  'aria-describedby'?: string
  /**
   * Restringe a busca a esta UF. No cadastro de clube a praça já veio do mapa —
   * sem isso "Praia Grande" mistura SC e SP e o operador grava o estado errado.
   */
  uf?: string
  placeholder?: string
}

type ResultadoBusca = {
  termo: string
  tentativa: number
  opcoes: MunicipioBrasil[]
  erro: string | null
}

function rotuloMunicipio(m: { cidade: string; uf: string }, ufFixa?: string): string {
  // Com UF já escolhida no mapa, o rótulo curto evita ruído "Cidade · SP" duplicado.
  if (ufFixa) return m.cidade
  return `${m.cidade} · ${m.uf}`
}

/**
 * Combobox de município (cidade + UF).
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
  const optionIdPrefix = useId()
  const listRef = useRef<HTMLUListElement>(null)
  const buscaSeq = useRef(0)

  const ufFiltro = uf?.trim().toUpperCase() || undefined
  const rotuloValue = value ? rotuloMunicipio(value, ufFiltro) : ''
  const [query, setQuery] = useState(rotuloValue)
  const [resultado, setResultado] = useState<ResultadoBusca | null>(null)
  const [aberto, setAberto] = useState(false)
  const [destaque, setDestaque] = useState(-1)
  const [tentativa, setTentativa] = useState(0)
  const [termoBusca, setTermoBusca] = useState('')

  const [prevValue, setPrevValue] = useState(rotuloValue)
  if (rotuloValue !== prevValue) {
    setPrevValue(rotuloValue)
    setQuery(rotuloValue)
  }

  // Debounce do texto digitado → termo de busca.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setTermoBusca(query.trim())
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [query])

  const espelhaValueSelecionado =
    value != null && termoBusca.length > 0 && termoBusca === rotuloMunicipio(value, ufFiltro)
  const termoBuscavel = termoBusca.length >= 2 && !espelhaValueSelecionado

  useEffect(() => {
    if (!termoBuscavel) return

    const seq = ++buscaSeq.current
    const termo = termoBusca
    const tent = tentativa
    void buscarRegioesPorTexto(termo, ufFiltro)
      .then((lista) => {
        if (seq !== buscaSeq.current) return
        const opcoes = ufFiltro ? lista.filter((m) => m.uf === ufFiltro) : lista
        setResultado({ termo, tentativa: tent, opcoes, erro: null })
        setDestaque(opcoes.length > 0 ? 0 : -1)
      })
      .catch(() => {
        if (seq !== buscaSeq.current) return
        setResultado({
          termo,
          tentativa: tent,
          opcoes: [],
          erro: 'Não foi possível buscar cidades. Tente novamente.',
        })
        setDestaque(-1)
      })
  }, [termoBusca, termoBuscavel, tentativa, ufFiltro])

  useEffect(() => {
    if (destaque < 0 || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(
      `#${CSS.escape(`${optionIdPrefix}-${destaque}`)}`,
    )
    el?.scrollIntoView({ block: 'nearest' })
  }, [destaque, optionIdPrefix])

  function selecionar(m: MunicipioBrasil) {
    const rotulo = rotuloMunicipio(m, ufFiltro)
    setQuery(rotulo)
    setPrevValue(rotulo)
    setAberto(false)
    setDestaque(-1)
    setResultado(null)
    onSelecionar(m)
  }

  const resultadoAtual =
    resultado &&
    resultado.termo === termoBusca &&
    resultado.tentativa === tentativa
      ? resultado
      : null
  const carregandoVisivel = termoBuscavel && !resultadoAtual
  const opcoesVisiveis = termoBuscavel && resultadoAtual ? resultadoAtual.opcoes : []
  const erro = resultadoAtual?.erro ?? null

  const mostrarLista = aberto && !disabled
  const termoAtual = query.trim()
  const espelhaValue = value != null && termoAtual === rotuloMunicipio(value, ufFiltro)
  const precisaMaisLetras = termoAtual.length < 2 || espelhaValue
  const activeDescendant =
    mostrarLista && destaque >= 0 && opcoesVisiveis[destaque]
      ? `${optionIdPrefix}-${destaque}`
      : undefined

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (aberto) {
        e.preventDefault()
        setAberto(false)
        setDestaque(-1)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAberto(true)
      if (opcoesVisiveis.length === 0) return
      setDestaque((d) => (d < 0 ? 0 : Math.min(d + 1, opcoesVisiveis.length - 1)))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAberto(true)
      if (opcoesVisiveis.length === 0) return
      setDestaque((d) => (d < 0 ? opcoesVisiveis.length - 1 : Math.max(d - 1, 0)))
      return
    }

    if (e.key === 'Home') {
      if (!aberto || opcoesVisiveis.length === 0) return
      e.preventDefault()
      setDestaque(0)
      return
    }

    if (e.key === 'End') {
      if (!aberto || opcoesVisiveis.length === 0) return
      e.preventDefault()
      setDestaque(opcoesVisiveis.length - 1)
      return
    }

    if (e.key === 'Enter') {
      if (!aberto || destaque < 0 || !opcoesVisiveis[destaque]) return
      e.preventDefault()
      selecionar(opcoesVisiveis[destaque])
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Input
          id={id}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => {
            setAberto(false)
            setDestaque(-1)
            // Texto digitado que não virou seleção válida é descartado.
            if (query !== rotuloValue) setQuery(rotuloValue)
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeDescendant}
          aria-describedby={ariaDescribedBy}
          aria-label={ufFiltro ? `Cidade em ${ufFiltro}` : 'Sua cidade'}
        />
        {carregandoVisivel && (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[rgb(var(--foreground-muted))]" />
        )}
      </div>

      {erro && (
        <div className="mt-1.5 flex items-center gap-2">
          <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>
          <button
            type="button"
            onClick={() => setTentativa((t) => t + 1)}
            className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {mostrarLista && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
        >
          {precisaMaisLetras ? (
            <li className="px-3 py-2 text-sm text-[rgb(var(--foreground-muted))]" role="presentation">
              {espelhaValue ? 'Digite para trocar de cidade' : 'Digite ao menos 2 letras'}
            </li>
          ) : carregandoVisivel ? (
            <li className="px-3 py-2 text-sm text-[rgb(var(--foreground-muted))]" role="presentation">
              Buscando…
            </li>
          ) : opcoesVisiveis.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[rgb(var(--foreground-muted))]" role="presentation">
              {ufFiltro
                ? `Nenhuma cidade em ${ufFiltro} com esse nome`
                : 'Nenhuma cidade encontrada'}
            </li>
          ) : (
            opcoesVisiveis.map((opcao, i) => {
              const selecionada =
                value != null && value.cidade === opcao.cidade && value.uf === opcao.uf
              const destacada = i === destaque
              return (
                <li
                  key={`${opcao.uf}-${opcao.cidade}`}
                  id={`${optionIdPrefix}-${i}`}
                  role="option"
                  aria-selected={selecionada || destacada}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      selecionar(opcao)
                    }}
                    onMouseEnter={() => setDestaque(i)}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] ${
                      destacada || selecionada
                        ? 'bg-[rgb(var(--background-subtle))]'
                        : 'hover:bg-[rgb(var(--background-subtle))]'
                    } ${
                      selecionada
                        ? 'font-semibold text-[rgb(var(--color-primary-fg))]'
                        : 'text-[rgb(var(--foreground))]'
                    }`}
                  >
                    {opcao.cidade}
                    {!ufFiltro ? (
                      <span className="text-[rgb(var(--foreground-muted))]"> · {opcao.uf}</span>
                    ) : null}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
