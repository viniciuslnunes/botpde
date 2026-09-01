/**
 * Badge de tipo Sede / Subsede / PDE — só tokens da casa.
 *
 * Paleta Tailwind (emerald/green/sky/blue) fura o tabu de arquirrival:
 * Gaviões via PDE verde Palmeiras; Galoucura via SUBSEDE azul da Máfia.
 * Primária / secundária / muted já passam por `sanearAcoesContraRivalidade`.
 */
export const SEDE_TIPO_BADGE_CLASS = {
  SEDE: 'bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]',
  SUBSEDE: 'bg-[rgb(var(--foreground)_/_0.08)] text-[rgb(var(--foreground-muted))]',
  PONTO_ENCONTRO:
    'bg-[rgb(var(--color-secondary)_/_0.16)] text-[rgb(var(--color-secondary-fg))]',
} as const

export type SedeTipoBadge = keyof typeof SEDE_TIPO_BADGE_CLASS

export function sedeTipoBadgeClass(tipo: string): string {
  if (tipo === 'SEDE' || tipo === 'SUBSEDE' || tipo === 'PONTO_ENCONTRO') {
    return SEDE_TIPO_BADGE_CLASS[tipo]
  }
  return SEDE_TIPO_BADGE_CLASS.PONTO_ENCONTRO
}
