import { describe, expect, it } from 'vitest'
import {
  capabilityPorSlug,
  DEPARTAMENTO_THIN_COPY,
  hrefModuloPortal,
  thinCopyPorSlug,
  THIN_COM_AGENDA,
} from '@torcida/types'

describe('departamento thin wrappers', () => {
  it('cobre as cinco áreas genéricas com copy', () => {
    const slugs = [
      'social-e-eventos',
      'materiais-loja',
      'comunicacao',
      'feminino',
      'carnaval',
    ] as const
    for (const slug of slugs) {
      expect(capabilityPorSlug(slug)?.portalPanel).toBe('generico')
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

  it('agenda preview só em social e carnaval', () => {
    expect([...THIN_COM_AGENDA].sort()).toEqual(['carnaval', 'social-e-eventos'])
  })
})
