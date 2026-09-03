const LOCALE = 'pt-BR'
export const APP_TIME_ZONE = 'America/Sao_Paulo'

export type CalendarParts = { year: number; month: number; day: number }

/** Formata data/hora com fuso fixo — evita mismatch de hidratação SSR (UTC) vs browser. */
export function formatDateTimeShort(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: APP_TIME_ZONE,
  }).format(date)
}

/** Data + hora compactas no feed da Comunidade ("27 de jul. · 14:32"). */
export function formatFeedPublicadoEm(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const data = new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    timeZone: APP_TIME_ZONE,
  }).format(date)
  return `${data} · ${formatTimeShort(date)}`
}

/** Hora curta (HH:mm) no fuso da app — usada no calendário da Agenda. */
export function formatTimeShort(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const bag = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: APP_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>
  return `${bag.hour}:${bag.minute}`
}

const MESES_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

const SEMANA_PT = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const

/** "julho de 2026" — strings fixas, sem depender de ICU Node vs browser. */
export function formatMonthYear(value: string | Date | CalendarParts): string {
  const parts = isCalendarParts(value) ? value : zonedDateParts(value)
  return `${MESES_PT[parts.month - 1]} de ${parts.year}`
}

/** "sábado, 18 de julho" — calendário civil estável (UTC noon das parts). */
export function formatWeekdayLong(value: string | Date | CalendarParts): string {
  const parts = isCalendarParts(value) ? value : zonedDateParts(value)
  const weekday = calendarPartsToUtcNoon(parts).getUTCDay()
  return `${SEMANA_PT[weekday]}, ${parts.day} de ${MESES_PT[parts.month - 1]}`
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
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    timeZone: APP_TIME_ZONE,
  }).format(date)
}

/** Partes de calendário (ano/mês/dia) no fuso America/Sao_Paulo. */
export function zonedDateParts(value: string | Date): CalendarParts {
  const date = toDate(value)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
  const bag = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
  }
}

/** Chave de dia estável SSR/cliente (mês 0-indexed, como Date#getMonth). */
export function dayKeyInZone(value: string | Date | CalendarParts): string {
  const p = isCalendarParts(value) ? value : zonedDateParts(value)
  return `${p.year}-${p.month - 1}-${p.day}`
}

/** "Hoje" no fuso da app (não no fuso do processo Node/browser). */
export function todayPartsInZone(now: Date = new Date()): CalendarParts {
  return zonedDateParts(now)
}

/**
 * Interpreta `YYYY-MM-DD` (ou prefixo ISO) como data de calendário, sem deslocar
 * para o dia anterior via `new Date('YYYY-MM-DD')` (UTC midnight).
 */
export function parseDateOnly(iso: string): CalendarParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  if (!m) return todayPartsInZone()
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
  }
}

/** Converte partes de calendário em `YYYY-MM-DD` (valor de formulário / DatePicker). */
export function formatDateOnlyIso(parts: CalendarParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

/** `YYYY-MM-DD` → `dd/mm/aaaa` para exibição pt-BR. */
export function formatDateOnlyPt(isoOrParts: string | CalendarParts): string {
  const parts = typeof isoOrParts === 'string' ? parseDateOnly(isoOrParts) : isoOrParts
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`
}

/** Compara dias civis: &lt;0 se a&lt;b, 0 se iguais, &gt;0 se a&gt;b. */
export function compareCalendarParts(a: CalendarParts, b: CalendarParts): number {
  if (a.year !== b.year) return a.year - b.year
  if (a.month !== b.month) return a.month - b.month
  return a.day - b.day
}

/** Hoje em America/Sao_Paulo como `YYYY-MM-DD`. */
export function todayDateOnlyIso(now: Date = new Date()): string {
  return formatDateOnlyIso(todayPartsInZone(now))
}

export function sameCalendarDay(a: CalendarParts, b: CalendarParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

/** Date UTC meio-dia para aritmética de calendário sem efeito de fuso. */
export function calendarPartsToUtcNoon(parts: CalendarParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0))
}

/**
 * Início do dia civil em America/Sao_Paulo como Instant UTC.
 * Brasil sem horário de verão desde 2019 → UTC−3 fixo.
 */
export function startOfZonedDayUtc(parts: CalendarParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 3, 0, 0, 0))
}

export function addCalendarDays(parts: CalendarParts, n: number): CalendarParts {
  const d = calendarPartsToUtcNoon(parts)
  d.setUTCDate(d.getUTCDate() + n)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

export function startOfWeekMonday(parts: CalendarParts): CalendarParts {
  const d = calendarPartsToUtcNoon(parts)
  const day = d.getUTCDay() // 0=Dom … 6=Sáb
  const diff = day === 0 ? -6 : 1 - day
  return addCalendarDays(parts, diff)
}

export function startOfMonthParts(parts: CalendarParts): CalendarParts {
  return { year: parts.year, month: parts.month, day: 1 }
}

function toDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value
}

function isCalendarParts(value: string | Date | CalendarParts): value is CalendarParts {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Date) &&
    'year' in value &&
    'month' in value &&
    'day' in value
  )
}
