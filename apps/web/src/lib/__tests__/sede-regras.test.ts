import { describe, expect, it } from 'vitest'
import {
  tiposPaiPermitidos,
  validarHierarquiaSede,
  validarRebaixamentoComFilhos,
} from '@/lib/sede-regras'

describe('sede-regras', () => {
  it('SEDE não aceita pai', () => {
    expect(
      validarHierarquiaSede('SEDE', { id: '1', tipo: 'SEDE', tenantId: 't' }),
    ).toMatch(/raiz/i)
    expect(validarHierarquiaSede('SEDE', null)).toBeNull()
  })

  it('SUBSEDE exige SEDE como pai', () => {
    expect(validarHierarquiaSede('SUBSEDE', null)).toMatch(/Sede/)
    expect(
      validarHierarquiaSede('SUBSEDE', { id: '1', tipo: 'SUBSEDE', tenantId: 't' }),
    ).toMatch(/Sede/)
    expect(
      validarHierarquiaSede('SUBSEDE', { id: '1', tipo: 'SEDE', tenantId: 't' }),
    ).toBeNull()
  })

  it('PDE aceita SEDE ou SUBSEDE', () => {
    expect(validarHierarquiaSede('PONTO_ENCONTRO', null)).toMatch(/Sede ou Subsede/)
    expect(
      validarHierarquiaSede('PONTO_ENCONTRO', {
        id: '1',
        tipo: 'PONTO_ENCONTRO',
        tenantId: 't',
      }),
    ).toMatch(/ponto de encontro/i)
    expect(
      validarHierarquiaSede('PONTO_ENCONTRO', { id: '1', tipo: 'SUBSEDE', tenantId: 't' }),
    ).toBeNull()
  })

  it('bloqueia rebaixamento com filhos incompatíveis', () => {
    expect(validarRebaixamentoComFilhos('PONTO_ENCONTRO', ['SUBSEDE'])).not.toBeNull()
    expect(validarRebaixamentoComFilhos('SUBSEDE', ['SUBSEDE'])).not.toBeNull()
    expect(validarRebaixamentoComFilhos('SUBSEDE', ['PONTO_ENCONTRO'])).toBeNull()
    expect(validarRebaixamentoComFilhos('SEDE', ['SUBSEDE'])).toBeNull()
  })

  it('tiposPaiPermitidos', () => {
    expect(tiposPaiPermitidos('SEDE')).toBeNull()
    expect(tiposPaiPermitidos('SUBSEDE')).toEqual(['SEDE'])
    expect(tiposPaiPermitidos('PONTO_ENCONTRO')).toEqual(['SEDE', 'SUBSEDE'])
  })
})
