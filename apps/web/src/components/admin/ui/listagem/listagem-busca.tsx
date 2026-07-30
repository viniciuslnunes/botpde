'use client'

import { Loader2, Search } from 'lucide-react'
import { PARAM_BUSCA } from '@/lib/listagem'
import { useListagemFormPendente } from './listagem-form'

export interface ListagemBuscaProps {
  defaultValue: string
  placeholder: string
  ariaLabel: string
}

/**
 * Campo de busca da listagem. Vive dentro de `ListagemForm`, que já cuida do
 * debounce e da navegação; aqui só entra o feedback de "buscando".
 */
export function ListagemBusca({ defaultValue, placeholder, ariaLabel }: ListagemBuscaProps) {
  const pendente = useListagemFormPendente()
  const Icone = pendente ? Loader2 : Search

  return (
    <label className="relative block min-w-0 flex-1 sm:max-w-sm">
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
        type="search"
        name={PARAM_BUSCA}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] py-2 pl-9 pr-3 text-sm text-[rgb(var(--foreground))] placeholder-[rgb(var(--foreground-muted))] outline-none transition-colors focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)]"
      />
    </label>
  )
}
