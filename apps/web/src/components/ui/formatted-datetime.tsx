'use client'

import { formatDateTimeShort } from '@/lib/format-datetime'

type FormattedDateTimeProps = {
  iso: string
  /** Texto já formatado no servidor — preferido para hidratação estável. */
  formatted?: string
  className?: string
}

export function FormattedDateTime({ iso, formatted, className }: FormattedDateTimeProps) {
  const label = formatted ?? formatDateTimeShort(iso)
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {label}
    </time>
  )
}
