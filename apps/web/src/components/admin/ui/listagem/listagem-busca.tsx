'use client'

import { useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Loader2, Search, X } from 'lucide-react'
import { PARAM_BUSCA } from '@/lib/listagem'
import { useListagemFormPendente } from './listagem-form'

export interface ListagemBuscaProps {
  defaultValue: string
  placeholder: string
  ariaLabel: string
}

/**
 * Campo de busca da listagem. Vive dentro de `ListagemForm`, que já cuida do
 * debounce e da navegação; aqui só entra o valor controlado (sincronizado com
 * a URL no render) e o feedback de "buscando".
 *
 * `defaultValue` descontrolado dessincronizava ao limpar: o input ficava vazio
 * e a URL mantinha `?q=`, então a tabela seguia filtrada.
 *
 * O botão de limpar fica FORA do `<label>`: controle interativo dentro de
 * label ativa o input no mesmo clique e o `requestSubmit` era pulado.
 */
export function ListagemBusca({ defaultValue, placeholder, ariaLabel }: ListagemBuscaProps) {
  const pendente = useListagemFormPendente()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [valor, setValor] = useState(defaultValue)
  const [sincronizado, setSincronizado] = useState(defaultValue)
  if (defaultValue !== sincronizado) {
    setSincronizado(defaultValue)
    setValor(defaultValue)
  }

  const Icone = pendente ? Loader2 : Search

  function limpar() {
    flushSync(() => setValor(''))
    const input = inputRef.current
    if (!input) return
    // O form escuta `input` (não o click): assim o override `q=` vazio chega
    // no debounce mesmo com o FormData ainda atrasado.
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.form?.requestSubmit()
  }

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-sm">
      <Icone
        className={[
          'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
          pendente
            ? 'animate-spin text-[rgb(var(--color-primary-fg))]'
            : 'text-[rgb(var(--foreground-muted))]',
        ].join(' ')}
        aria-hidden
      />
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        name={PARAM_BUSCA}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] py-2 pl-9 pr-10 text-sm text-[rgb(var(--foreground))] placeholder-[rgb(var(--foreground-muted))] outline-none transition-colors focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)] [&::-webkit-search-cancel-button]:hidden"
      />
      {valor ? (
        <button
          type="button"
          onClick={limpar}
          className="app-touch-target absolute right-1 top-1/2 -translate-y-1/2 rounded-md text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
          aria-label="Limpar busca"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
