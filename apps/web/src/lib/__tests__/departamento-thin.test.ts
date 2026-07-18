import { describe, expect, it } from 'vitest'
import {
  capabilityPorSlug,
  DEPARTAMENTO_THIN_COPY,
  hrefModuloPortal,
  thinCopyPorSlug,
  THIN_COM_AGENDA,
} from '@torcida/types'

describe('departamento thin wrappers', () => {
  it('cobre as áreas thin genéricas com portalPanel generico', () => {
    const thinGenericos = [
      'social-e-eventos',
      'materiais-loja',
      'comunicacao',
      'feminino',
    ] as const
    for (const slug of thinGenericos) {
      expect(capabilityPorSlug(slug)?.portalPanel).toBe('generico')
    }
  })

  it('todas as copies thin têm título e CTA (carnaval = fallback de missão)', () => {
    for (const slug of Object.keys(DEPARTAMENTO_THIN_COPY)) {
      expect(thinCopyPorSlug(slug)?.titulo).toBeTruthy()
      expect(DEPARTAMENTO_THIN_COPY[slug].ctaModulo).toMatch(/Abrir/i)
    }
  })

  it('módulos portal nunca apontam para /admin', () => {
    for (const slug of Object.keys(DEPARTAMENTO_THIN_COPY)) {
      const cap = capabilityPorSlug(slug)
      expect(cap).toBeTruthy()
      const href = hrefModuloPortal(cap!.moduloPortal)
      expect(href).toBeTruthy()
      expect(href!.startsWith('/portal/')).toBe(true)
      expect(href!.startsWith('/admin')).toBe(false)
    }
  })

  it('agenda preview só em social e feminino', () => {
    expect([...THIN_COM_AGENDA].sort()).toEqual(['feminino', 'social-e-eventos'])
  })
})
