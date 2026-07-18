'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { Input } from '@torcida/ui'
import { normalizarTexto } from '@/lib/onboarding-unidade'
import { buscarCidadesDaUf } from './actions'

const MAX_OPCOES_VISIVEIS = 50

type Props = {
  uf: string
  value: string
  onChange: (cidade: string) => void
  disabled?: boolean
}

/**
 * Combobox de cidade validada contra os municípios do IBGE da UF escolhida.
 * A cidade só é definida clicando numa opção — texto digitado que não vira
 * seleção é descartado no blur. Quem troca a UF deve limpar `value` (o passo
 * de região já faz isso ao selecionar outro estado).
 */
export function ComboboxCidade({ uf, value, onChange, disabled }: Props) {
  const [opcoes, setOpcoes] = useState<string[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)
  const [query, setQuery] = useState(value)
  const [tentativa, setTentativa] = useState(0)
  const [carregando, startCarregar] = useTransition()

  // Ajuste de estado durante o render (padrão React para reagir a props):
  // troca de UF zera opções/erro/dropdown; mudança externa de value sincroniza o texto.
  const [prevUf, setPrevUf] = useState(uf)
  if (uf !== prevUf) {
    setPrevUf(uf)
    setOpcoes(null)
    setErro(null)
    setAberto(false)
  }
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setQuery(value)
  }

  useEffect(() => {
    if (!uf) return
    let ativo = true
    startCarregar(async () => {
      try {
        const lista = await buscarCidadesDaUf(uf)
        if (!ativo) return
        if (lista.length === 0) {
          setOpcoes(null)
          setErro('Não foi possível carregar as cidades. Tente novamente.')
          return
        }
        setOpcoes(lista)
      } catch {
        if (!ativo) return
        setOpcoes(null)
        setErro('Não foi possível carregar as cidades. Tente novamente.')
      }
    })
    return () => {
      ativo = false
    }
  }, [uf, tentativa])

  const filtradas = useMemo(() => {
    if (!opcoes) return []
    const alvo = normalizarTexto(query)
    const lista = alvo ? opcoes.filter((o) => normalizarTexto(o).includes(alvo)) : opcoes
    return lista.slice(0, MAX_OPCOES_VISIVEIS)
  }, [opcoes, query])

  function selecionar(opcao: string) {
    setQuery(opcao)
    setPrevValue(opcao)
    onChange(opcao)
    setAberto(false)
  }

  const inputDesabilitado = disabled || !uf || carregando

  return (
    <div className="relative">
      <div className="relative">
        <Input
          id="cidade"
          value={query}
          disabled={inputDesabilitado}
          onChange={(e) => {
            setQuery(e.target.value)
            setAberto(true)
          }}
          onFocus={() => {
            if (opcoes) setAberto(true)
          }}
          onBlur={() => {
            setAberto(false)
            // Texto digitado que não virou seleção válida é descartado.
            if (query !== value) setQuery(value)
          }}
          placeholder={!uf ? 'Selecione o estado primeiro' : 'Busque e selecione sua cidade'}
          autoComplete="off"
          role="combobox"
          aria-expanded={aberto}
          aria-controls="combobox-cidade-opcoes"
          aria-label="Cidade"
        />
        {carregando && (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[rgb(var(--foreground-muted))]" />
        )}
      </div>

      {erro && (
        <div className="mt-1.5 flex items-center gap-2">
          <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>
          <button
            type="button"
            onClick={() => {
              setErro(null)
              setTentativa((t) => t + 1)
            }}
            className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {aberto && opcoes !== null && !carregando && (
        <ul
          id="combobox-cidade-opcoes"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-1 shadow-lg"
        >
          {filtradas.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[rgb(var(--foreground-muted))]">
              Nenhuma cidade encontrada para {uf}.
            </li>
          ) : (
            filtradas.map((opcao) => (
              <li key={opcao}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selecionar(opcao)
                  }}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-[rgb(var(--background-subtle))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary))] ${
                    opcao === value
                      ? 'font-semibold text-[rgb(var(--color-primary-fg))]'
                      : 'text-[rgb(var(--foreground))]'
                  }`}
                >
                  {opcao}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
