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
