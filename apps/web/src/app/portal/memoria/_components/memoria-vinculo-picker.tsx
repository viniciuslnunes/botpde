'use client'

import { CalendarDays, MessageSquareText } from 'lucide-react'
import { SearchPicker, type ReactiveSearchOption } from '@/components/ui/reactive-search'

export type MemoriaVinculoItem = ReactiveSearchOption

type Props = {
  label: string
  placeholder: string
  emptyMessage: string
  items: MemoriaVinculoItem[]
  valueId: string | null
  onChange: (id: string | null) => void
  kind: 'evento' | 'publicacao'
  disabled?: boolean
}

export function MemoriaVinculoPicker({
  label,
  placeholder,
  emptyMessage,
  items,
  valueId,
  onChange,
  kind,
  disabled = false,
}: Props) {
  const fallbackIcon = kind === 'evento' ? CalendarDays : MessageSquareText

  return (
    <SearchPicker
      label={label}
      placeholder={placeholder}
      emptyMessage={emptyMessage}
      items={items}
      valueId={valueId}
      onChange={onChange}
      disabled={disabled}
      fallbackIcon={fallbackIcon}
    />
  )
}
