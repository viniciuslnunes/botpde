'use client'

import { SearchPicker, type ReactiveSearchOption } from '@/components/ui/reactive-search'

export interface ComboOption {
  id: string
  label: string
  sublabel?: string
}

const MAX_VISIVEL = 40

/**
 * Combobox de busca (autocomplete) para listas grandes — filtragem client-side
 * por label/sublabel. Implementação canônica em `SearchPicker`.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  emptyText = 'Nada encontrado.',
}: {
  options: ComboOption[]
  value: string | null
  onChange: (id: string | null) => void
  placeholder: string
  disabled?: boolean
  emptyText?: string
}) {
  const items: ReactiveSearchOption[] = options.map((o) => ({
    id: o.id,
    label: o.label,
    sublabel: o.sublabel,
  }))

  return (
    <SearchPicker
      placeholder={placeholder}
      emptyMessage={emptyText}
      noResultsMessage={emptyText}
      items={items}
      valueId={value}
      onChange={onChange}
      disabled={disabled}
      maxResults={MAX_VISIVEL}
    />
  )
}
