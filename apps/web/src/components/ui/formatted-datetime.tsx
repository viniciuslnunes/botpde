'use client'

import { useSyncExternalStore } from 'react'
import { formatDateTimeShort } from '@/lib/format-datetime'

const subscribe = () => () => {}

function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false)
}

type FormattedDateTimeProps = {
  iso: string
  /** Texto já formatado no servidor — hidrata sem mismatch. */
  formatted?: string
  className?: string
}

/** Renderiza data/hora após montagem no cliente, ou usa string pré-formatada do servidor. */
export function FormattedDateTime({ iso, formatted, className }: FormattedDateTimeProps) {
  const isClient = useIsClient()

  if (formatted) {
    return (
      <time dateTime={iso} className={className}>
        {formatted}
      </time>
    )
  }

  if (!isClient) {
    return (
      <time dateTime={iso} className={className} suppressHydrationWarning>
        {'\u00a0'}
      </time>
    )
  }

  return (
    <time dateTime={iso} className={className}>
      {formatDateTimeShort(iso)}
    </time>
  )
}
