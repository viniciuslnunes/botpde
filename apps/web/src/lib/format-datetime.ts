const LOCALE = 'pt-BR'
const TIME_ZONE = 'America/Sao_Paulo'

/** Formata data/hora com fuso fixo — evita mismatch de hidratação SSR (UTC) vs browser. */
export function formatDateTimeShort(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: TIME_ZONE,
  }).format(date)
}

/**
 * Tempo relativo curto ("agora", "há 5 min", "há 2 h", "há 3 d").
 * Calcule SEMPRE no servidor (Server Component) e renderize como texto estático —
 * recalcular no cliente com `now()` diferente causa mismatch de hidratação.
 */
export function formatRelative(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const diffMs = Date.now() - date.getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `há ${days} d`
  return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', timeZone: TIME_ZONE }).format(date)
}
