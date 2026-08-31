export function parseAcervoTab<const T extends readonly string[]>(
  raw: string | undefined,
  allowed: T,
  fallback: T[number],
): T[number] {
  if (raw && (allowed as readonly string[]).includes(raw)) return raw as T[number]
  return fallback
}
