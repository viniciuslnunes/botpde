import { describe, it, expect } from 'vitest'
import {
  avaliarElegibilidade,
  BENEFICIOS_ELEGIBILIDADE,
  resumoElegibilidade,
} from '@torcida/types'

const membroOk = {
  membroAtivo: true,
  desligado: false,
  bloqueado: false,
  adimplente: true,
  ehSocio: true,
  carteirinhaValida: true,
}

describe('avaliarElegibilidade — vínculo', () => {
  it('membro em dia usa todos os benefícios', () => {
    for (const beneficio of BENEFICIOS_ELEGIBILIDADE) {
      const r = avaliarElegibilidade(beneficio, membroOk)
      expect(r.permitido, beneficio).toBe(true)
      expect(r.bloqueios).toEqual([])
    }
  })

  it('bloqueado e desligado não usam nada', () => {
    for (const estado of [
      { ...membroOk, bloqueado: true },
      { ...membroOk, desligado: true, membroAtivo: false },
      { ...membroOk, membroAtivo: false },
    ]) {
      for (const beneficio of BENEFICIOS_ELEGIBILIDADE) {
        expect(avaliarElegibilidade(beneficio, estado).permitido).toBe(false)
      }
    }
  })

  it('estado ausente é tratado como sem vínculo, não como liberado', () => {
    // @ts-expect-error — entrada crua, como viria de um id desconhecido
    const r = avaliarElegibilidade('ESCALA', undefined)
    expect(r.permitido).toBe(false)
  })
})

describe('avaliarElegibilidade — inadimplência', () => {
  const devendo = { ...membroOk, adimplente: false }

  it('avisa na escala e no embarque, sem barrar', () => {
    for (const beneficio of ['ESCALA', 'EMBARQUE'] as const) {
      const r = avaliarElegibilidade(beneficio, devendo)
      expect(r.permitido, beneficio).toBe(true)
      expect(r.avisos).toContain('Inadimplente')
    }
  })

  it('barra a comanda, porque comanda é crédito', () => {
    const r = avaliarElegibilidade('COMANDA', devendo)
    expect(r.permitido).toBe(false)
    expect(r.bloqueios[0]).toMatch(/crédito/i)
  })
})

describe('avaliarElegibilidade — carteirinha e preço de sócio', () => {
  it('carteirinha vencida avisa nos outros e barra o preço de sócio', () => {
    const vencida = { ...membroOk, carteirinhaValida: false }
    expect(avaliarElegibilidade('ESCALA', vencida).avisos).toContain('Carteirinha vencida')
    expect(avaliarElegibilidade('PRECO_SOCIO', vencida).permitido).toBe(false)
  })

  it('torcedor não sócio não tem preço de sócio, mas embarca', () => {
    const torcedor = { ...membroOk, ehSocio: false, carteirinhaValida: true }
    expect(avaliarElegibilidade('PRECO_SOCIO', torcedor).permitido).toBe(false)
    expect(avaliarElegibilidade('EMBARQUE', torcedor).permitido).toBe(true)
  })

  it('quem não é sócio não recebe aviso de carteirinha', () => {
    const torcedor = { ...membroOk, ehSocio: false, carteirinhaValida: false }
    expect(avaliarElegibilidade('ESCALA', torcedor).avisos).not.toContain('Carteirinha vencida')
  })
})

describe('resumoElegibilidade', () => {
  it('silêncio quando está tudo certo', () => {
    expect(resumoElegibilidade(avaliarElegibilidade('ESCALA', membroOk))).toBeNull()
    expect(resumoElegibilidade(null)).toBeNull()
  })

  it('bloqueio ganha do aviso', () => {
    const r = avaliarElegibilidade('COMANDA', {
      ...membroOk,
      adimplente: false,
      carteirinhaValida: false,
    })
    expect(resumoElegibilidade(r)?.tom).toBe('danger')
  })

  it('aviso aparece em tom de atenção', () => {
    const r = avaliarElegibilidade('ESCALA', { ...membroOk, adimplente: false })
    expect(resumoElegibilidade(r)).toEqual({ texto: 'Inadimplente', tom: 'warning' })
  })
})
