import { describe, expect, it } from 'vitest'
import { SEDE_TIPO_BADGE_CLASS, sedeTipoBadgeClass } from '@/lib/sede-tipo-badge'

const PALETA_TABU =
  /\b(?:bg|text|border|from|to|via|ring|fill|stroke)-(?:green|emerald|lime|teal|sky|blue|indigo|cyan)-[0-9]{2,3}\b/

describe('SEDE_TIPO_BADGE_CLASS', () => {
  it('não usa paleta Tailwind de arquirrival (PDE verde / SUBSEDE azul)', () => {
    const joined = Object.values(SEDE_TIPO_BADGE_CLASS).join(' ')
    expect(joined).not.toMatch(PALETA_TABU)
  })

  it('diferencia os três tipos só com tokens da casa', () => {
    expect(SEDE_TIPO_BADGE_CLASS.SEDE).toContain('--color-primary')
    expect(SEDE_TIPO_BADGE_CLASS.SUBSEDE).toContain('--foreground')
    expect(SEDE_TIPO_BADGE_CLASS.PONTO_ENCONTRO).toContain('--color-secondary')
  })

  it('sedeTipoBadgeClass cobre tipo conhecido e cai no PDE', () => {
    expect(sedeTipoBadgeClass('SEDE')).toBe(SEDE_TIPO_BADGE_CLASS.SEDE)
    expect(sedeTipoBadgeClass('desconhecido')).toBe(SEDE_TIPO_BADGE_CLASS.PONTO_ENCONTRO)
  })
})
