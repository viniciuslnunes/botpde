import { describe, it, expect } from 'vitest'
import { pendenciasFrota, podeAlocarNoVeiculo, resumirFrota } from '@torcida/types'

const onibus1 = { id: 'v1', identificacao: 'Ônibus 1', capacidade: 2, temResponsavel: true }
const onibus2 = { id: 'v2', identificacao: 'Ônibus 2', capacidade: 3, temResponsavel: false }

describe('resumirFrota', () => {
  it('frota vazia com gente confirmada deixa todo mundo sem lugar', () => {
    const r = resumirFrota([], [{ userId: 'a', veiculoId: null }])
    expect(r.capacidadeTotal).toBe(0)
    expect(r.semVeiculo).toBe(1)
    expect(r.faltamAssentos).toBe(1)
  })

  it('conta ocupação por veículo e assentos livres', () => {
    const r = resumirFrota(
      [onibus1, onibus2],
      [
        { userId: 'a', veiculoId: 'v1' },
        { userId: 'b', veiculoId: 'v1' },
        { userId: 'c', veiculoId: 'v2' },
        { userId: 'd', veiculoId: null },
      ],
    )
    expect(r.capacidadeTotal).toBe(5)
    expect(r.alocados).toBe(3)
    expect(r.semVeiculo).toBe(1)
    expect(r.faltamAssentos).toBe(0)
    const v1 = r.veiculos.find((v) => v.id === 'v1')
    expect(v1?.ocupados).toBe(2)
    expect(v1?.livres).toBe(0)
    expect(v1?.lotado).toBe(true)
  })

  it('quem não está confirmado não ocupa assento', () => {
    const r = resumirFrota(
      [onibus1],
      [
        { userId: 'a', veiculoId: 'v1', confirmado: true },
        { userId: 'b', veiculoId: 'v1', confirmado: false },
      ],
    )
    expect(r.alocados).toBe(1)
    expect(r.confirmados).toBe(1)
  })

  it('alocação em veículo inexistente cai como sem lugar, não some', () => {
    const r = resumirFrota([onibus1], [{ userId: 'a', veiculoId: 'fantasma' }])
    expect(r.semVeiculo).toBe(1)
    expect(r.alocados).toBe(0)
  })

  it('conta veículos sem responsável', () => {
    expect(resumirFrota([onibus1, onibus2], []).semResponsavel).toBe(1)
  })
})

describe('podeAlocarNoVeiculo', () => {
  it('barra quando lotado', () => {
    const r = podeAlocarNoVeiculo({ capacidade: 2, ocupados: 2 })
    expect(r.permitido).toBe(false)
    expect(r.motivo).toMatch(/lotado/i)
  })

  it('permite quem já está no veículo (realocação no mesmo ônibus)', () => {
    expect(podeAlocarNoVeiculo({ capacidade: 2, ocupados: 2 }, true).permitido).toBe(true)
  })

  it('permite com assento livre', () => {
    expect(podeAlocarNoVeiculo({ capacidade: 3, ocupados: 1 }).permitido).toBe(true)
  })
})

describe('pendenciasFrota', () => {
  it('viagem passada não gera pendência', () => {
    const r = resumirFrota([], [{ userId: 'a', veiculoId: null }])
    expect(pendenciasFrota(r, -1)).toEqual([])
  })

  it('caravana com gente e sem veículo é pendência alta', () => {
    const r = resumirFrota([], [{ userId: 'a', veiculoId: null }])
    expect(pendenciasFrota(r, 100)[0]).toMatchObject({
      chave: 'sem-veiculo',
      severidade: 'alta',
    })
  })

  it('assentos insuficientes aparecem antes do resto', () => {
    const r = resumirFrota(
      [onibus1],
      [
        { userId: 'a', veiculoId: 'v1' },
        { userId: 'b', veiculoId: 'v1' },
        { userId: 'c', veiculoId: null },
      ],
    )
    expect(pendenciasFrota(r, 100)[0]?.chave).toBe('assentos')
  })

  it('sem responsável é pendência mesmo com a frota folgada', () => {
    const r = resumirFrota([onibus2], [])
    expect(pendenciasFrota(r, 100).some((p) => p.chave === 'sem-responsavel')).toBe(true)
  })

  it('gente sem ônibus só vira pendência perto da viagem', () => {
    const r = resumirFrota([onibus1], [{ userId: 'a', veiculoId: null }])
    expect(pendenciasFrota(r, 500).some((p) => p.chave === 'sem-lugar')).toBe(false)
    expect(pendenciasFrota(r, 10).some((p) => p.chave === 'sem-lugar')).toBe(true)
  })
})
