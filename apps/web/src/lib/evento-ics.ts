/** Helpers de calendário (.ics) e links de evento — puro, sem I/O. */

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** Formata Date → UTC ICS `YYYYMMDDTHHMMSSZ`. */
export function toIcsUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function buildEventoIcs(opts: {
  id: string
  titulo: string
  descricao?: string | null
  local?: string | null
  data: Date
  /** Duração padrão 2h se não houver fim. */
  duracaoHoras?: number
}): string {
  const start = new Date(opts.data)
  const end = new Date(start.getTime() + (opts.duracaoHoras ?? 2) * 60 * 60 * 1000)
  const agora = toIcsUtc(new Date())
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Torcida//Agenda//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:evento-${opts.id}@torcida`,
    `DTSTAMP:${agora}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcs(opts.titulo)}`,
  ]
  if (opts.descricao) lines.push(`DESCRIPTION:${escapeIcs(opts.descricao)}`)
  if (opts.local) lines.push(`LOCATION:${escapeIcs(opts.local)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadIcsFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`
  a.click()
  URL.revokeObjectURL(url)
}
