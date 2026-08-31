import { describe, expect, it } from 'vitest'
import {
  aplicarPisoNivel,
  labelNivelConfianca,
  materializarSaldoConfianca,
  nivelPorScore,
  origemConfereConfianca,
  pisoNivelPorCargos,
  progressoProximoNivel,
  SINAL_CONFIANCA,
  somarScoreEventos,
  temCapacidade,
} from '@torcida/types'

describe('nivelPorScore', () => {
  it('faixas 0 / 20 / 50 / 80', () => {
    expect(nivelPorScore(0)).toBe(0)
    expect(nivelPorScore(19)).toBe(0)
    expect(nivelPorScore(20)).toBe(1)
    expect(nivelPorScore(49)).toBe(1)
    expect(nivelPorScore(50)).toBe(2)
    expect(nivelPorScore(80)).toBe(3)
    expect(nivelPorScore(100)).toBe(3)
  })
})

describe('pisoNivelPorCargos', () => {
  it('owner/admin/vice de sistema têm piso 2', () => {
    expect(pisoNivelPorCargos([{ nome: 'owner', isSystem: true }])).toBe(2)
    expect(pisoNivelPorCargos([{ nome: 'admin', isSystem: true }])).toBe(2)
    expect(pisoNivelPorCargos([{ nome: 'vice', isSystem: true }])).toBe(2)
  })

  it('member de sistema não tem piso', () => {
    expect(pisoNivelPorCargos([{ nome: 'member', isSystem: true }])).toBe(0)
    expect(pisoNivelPorCargos([])).toBe(0)
  })

  it('perfil customizado com nome de sistema não ganha piso', () => {
    expect(pisoNivelPorCargos([{ nome: 'owner', isSystem: false }])).toBe(0)
    expect(pisoNivelPorCargos([{ nome: 'Owner', isSystem: false }])).toBe(0)
  })

  it('isSystem com grafia diferente do canônico não ganha piso', () => {
    expect(pisoNivelPorCargos([{ nome: 'Owner', isSystem: true }])).toBe(0)
    expect(pisoNivelPorCargos([{ nome: 'ADMIN', isSystem: true }])).toBe(0)
  })
})

describe('temCapacidade', () => {
  it('grupo/canal/sala só a partir do nível 2', () => {
    expect(temCapacidade(0, 'grupo:criar')).toBe(false)
    expect(temCapacidade(1, 'grupo:criar')).toBe(false)
    expect(temCapacidade(2, 'grupo:criar')).toBe(true)
    expect(temCapacidade(3, 'grupo:criar')).toBe(true)
    expect(temCapacidade(1, 'canal:criar')).toBe(false)
    expect(temCapacidade(2, 'canal:criar')).toBe(true)
    expect(temCapacidade(1, 'sala:hospedar')).toBe(false)
    expect(temCapacidade(2, 'sala:hospedar')).toBe(true)
  })
})

describe('labelNivelConfianca / progressoProximoNivel', () => {
  it('label segue o nível efetivo', () => {
    expect(labelNivelConfianca(0)).toBe('Novato')
    expect(labelNivelConfianca(1)).toBe('Conhecido')
    expect(labelNivelConfianca(2)).toBe('De casa')
    expect(labelNivelConfianca(3)).toBe('Referência')
  })

  it('progresso privado aponta o próximo nível sem expor ranking', () => {
    expect(progressoProximoNivel(0, 0)).toEqual({ label: 'Conhecido', faltam: 20 })
    expect(progressoProximoNivel(0, 2)).toEqual({ label: 'Referência', faltam: 80 })
    expect(progressoProximoNivel(50, 2)).toEqual({ label: 'Referência', faltam: 30 })
    expect(progressoProximoNivel(80, 3)).toBeNull()
  })
})

describe('somarScoreEventos', () => {
  const agora = new Date('2026-08-30T12:00:00.000Z')

  it('aprovação + mensalidade + check-in', () => {
    expect(
      somarScoreEventos(
        [
          { sinal: 'APROVACAO', peso: SINAL_CONFIANCA.APROVACAO.peso, criadoEm: agora },
          { sinal: 'MENSALIDADE', peso: SINAL_CONFIANCA.MENSALIDADE.peso, criadoEm: agora },
          { sinal: 'CHECKIN', peso: SINAL_CONFIANCA.CHECKIN.peso, criadoEm: agora },
        ],
        agora,
      ),
    ).toBe(55)
  })

  it('reprovação derruba rápido', () => {
    expect(
      somarScoreEventos(
        [
          { sinal: 'APROVACAO', peso: 20, criadoEm: agora },
          { sinal: 'REPROVACAO', peso: -40, criadoEm: agora },
        ],
        agora,
      ),
    ).toBe(0)
  })

  it('teto de check-in na janela: 4×15 vira 45', () => {
    const eventos = [1, 2, 3, 4].map((i) => ({
      sinal: 'CHECKIN' as const,
      peso: 15,
      criadoEm: new Date(agora.getTime() - i * 24 * 60 * 60 * 1000),
    }))
    expect(somarScoreEventos(eventos, agora)).toBe(45)
  })

  it('check-in antigo conta metade (não evapora)', () => {
    const antigo = new Date(agora.getTime() - 40 * 24 * 60 * 60 * 1000)
    expect(somarScoreEventos([{ sinal: 'CHECKIN', peso: 15, criadoEm: antigo }], agora)).toBe(7)
  })

  it('teto de mensalidade na janela: 5×20 vira 20', () => {
    const eventos = [1, 2, 3, 4, 5].map((i) => ({
      sinal: 'MENSALIDADE' as const,
      peso: 20,
      criadoEm: new Date(agora.getTime() - i * 24 * 60 * 60 * 1000),
    }))
    expect(somarScoreEventos(eventos, agora)).toBe(20)
  })
})

describe('origemConfereConfianca', () => {
  const eu = { userId: 'u1', tenantId: 't1' }

  it('recusa origem de outra pessoa ou tenant', () => {
    expect(
      origemConfereConfianca('CHECKIN', eu, {
        userId: 'u2',
        tenantId: 't1',
        checkedInAt: new Date(),
      }),
    ).toBe(false)
    expect(
      origemConfereConfianca('MENSALIDADE', eu, {
        userId: 'u1',
        tenantId: 't2',
        tipo: 'MENSALIDADE',
        status: 'PAGA',
      }),
    ).toBe(false)
  })

  it('check-in exige presença; mensalidade tem de ser PAGA', () => {
    expect(origemConfereConfianca('CHECKIN', eu, { ...eu, checkedInAt: null })).toBe(false)
    expect(origemConfereConfianca('CHECKIN', eu, { ...eu, checkedInAt: new Date() })).toBe(true)
    expect(
      origemConfereConfianca('MENSALIDADE', eu, { ...eu, tipo: 'MENSALIDADE', status: 'PENDENTE' }),
    ).toBe(false)
    expect(
      origemConfereConfianca('MENSALIDADE', eu, { ...eu, tipo: 'AVULSA', status: 'PAGA' }),
    ).toBe(false)
    expect(
      origemConfereConfianca('MENSALIDADE', eu, { ...eu, tipo: 'MENSALIDADE', status: 'PAGA' }),
    ).toBe(true)
  })

  it('aprovação / reprovação exigem o status correspondente', () => {
    expect(origemConfereConfianca('APROVACAO', eu, { ...eu, status: 'PENDENTE' })).toBe(false)
    expect(origemConfereConfianca('APROVACAO', eu, { ...eu, status: 'APROVADO' })).toBe(true)
    expect(origemConfereConfianca('REPROVACAO', eu, { ...eu, status: 'APROVADO' })).toBe(false)
    expect(origemConfereConfianca('REPROVACAO', eu, { ...eu, status: 'REPROVADO' })).toBe(true)
  })
})

describe('materializarSaldoConfianca', () => {
  it('piso de cargo sobe o nível sem inflar o score', () => {
    expect(materializarSaldoConfianca({ score: 0, pisoNivel: 2 })).toEqual({ score: 0, nivel: 2 })
    expect(aplicarPisoNivel(0, 2)).toBe(2)
  })
})
