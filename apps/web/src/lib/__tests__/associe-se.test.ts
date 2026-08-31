import { describe, expect, it } from 'vitest'
import {
  avaliarAssociacaoNaTorcida,
  estadoCtaAssocieSe,
  parseRegiaoOnboarding,
  torcidaElegivelVitrine,
  vinculoContaComoAssociacao,
  MENSAGEM_BLOQUEIO_ASSOCIACAO,
  mensagemSemLiderancaUnidade,
} from '@torcida/types/associe-se'

const base = {
  raizId: 'gavioes',
  tipo: 'SOCIO' as const,
  status: 'APROVADO' as const,
  espelhado: false,
  desligadoEm: null,
}

describe('vinculoContaComoAssociacao', () => {
  it('ignora espelho, desligado e reprovado', () => {
    expect(vinculoContaComoAssociacao({ ...base, espelhado: true })).toBe(false)
    expect(vinculoContaComoAssociacao({ ...base, desligadoEm: new Date() })).toBe(false)
    expect(vinculoContaComoAssociacao({ ...base, status: 'REPROVADO' })).toBe(false)
  })

  it('conta sócio/torcedor aprovado ou pendente', () => {
    expect(vinculoContaComoAssociacao(base)).toBe(true)
    expect(vinculoContaComoAssociacao({ ...base, tipo: 'TORCEDOR' })).toBe(true)
    expect(vinculoContaComoAssociacao({ ...base, status: 'PENDENTE' })).toBe(true)
  })
})

describe('torcidaElegivelVitrine', () => {
  it('exige portal ativo, não sintético, com presidente e sem canal restrito', () => {
    expect(
      torcidaElegivelVitrine({
        ativo: true,
        sintetico: false,
        temLideranca: true,
        canalRestrito: false,
      }),
    ).toBe(true)
    expect(
      torcidaElegivelVitrine({
        ativo: true,
        sintetico: false,
        temLideranca: false,
        canalRestrito: false,
      }),
    ).toBe(false)
    expect(
      torcidaElegivelVitrine({
        ativo: true,
        sintetico: false,
        temLideranca: true,
        canalRestrito: true,
      }),
    ).toBe(false)
  })
})

describe('avaliarAssociacaoNaTorcida', () => {
  it('libera quem ainda não tem torcida', () => {
    expect(avaliarAssociacaoNaTorcida('gavioes', [])).toEqual({ ok: true })
  })

  it('bloqueia segunda torcida', () => {
    expect(avaliarAssociacaoNaTorcida('camisa-12', [base])).toEqual({
      ok: false,
      motivo: 'outra_torcida',
    })
  })

  it('bloqueia quem já é sócio da mesma', () => {
    expect(avaliarAssociacaoNaTorcida('gavioes', [base])).toEqual({
      ok: false,
      motivo: 'ja_socio',
    })
  })

  it('bloqueia solicitação duplicada pendente', () => {
    expect(
      avaliarAssociacaoNaTorcida('gavioes', [{ ...base, status: 'PENDENTE' }]),
    ).toEqual({ ok: false, motivo: 'pendente' })
  })

  it('permite upgrade torcedor → sócio na mesma worktree', () => {
    expect(
      avaliarAssociacaoNaTorcida('gavioes', [{ ...base, tipo: 'TORCEDOR' }]),
    ).toEqual({ ok: true, upgrade: true })
  })

  it('não deixa o torcedor de A associar em B', () => {
    expect(
      avaliarAssociacaoNaTorcida('camisa-12', [{ ...base, tipo: 'TORCEDOR' }]),
    ).toEqual({ ok: false, motivo: 'outra_torcida' })
  })
})

describe('estadoCtaAssocieSe', () => {
  it('descobrir sem vínculo, oculto se já sócio', () => {
    expect(estadoCtaAssocieSe([])).toEqual({
      mostrar: true,
      modo: 'descobrir',
      raizId: null,
    })
    expect(estadoCtaAssocieSe([base])).toEqual({
      mostrar: false,
      modo: 'oculto',
      raizId: 'gavioes',
    })
  })

  it('pendente e upgrade', () => {
    expect(estadoCtaAssocieSe([{ ...base, status: 'PENDENTE' }])).toEqual({
      mostrar: true,
      modo: 'pendente',
      raizId: 'gavioes',
    })
    expect(estadoCtaAssocieSe([{ ...base, tipo: 'TORCEDOR' }])).toEqual({
      mostrar: true,
      modo: 'upgrade',
      raizId: 'gavioes',
    })
  })
})

describe('parseRegiaoOnboarding', () => {
  it('lê cidade e UF do label gravado', () => {
    expect(parseRegiaoOnboarding('São Paulo - SP')).toEqual({
      cidade: 'São Paulo',
      uf: 'SP',
    })
    expect(parseRegiaoOnboarding('SP')).toEqual({ cidade: '', uf: 'SP' })
    expect(parseRegiaoOnboarding(null)).toEqual({ cidade: '', uf: '' })
  })
})

describe('MENSAGEM_BLOQUEIO_ASSOCIACAO', () => {
  it('explica associação só no clube do onboarding', () => {
    expect(MENSAGEM_BLOQUEIO_ASSOCIACAO.clube_errado).toMatch(/clube/i)
  })
})

describe('mensagemSemLiderancaUnidade', () => {
  it('sede usa o aviso da torcida; unidade fala da própria liderança', () => {
    expect(mensagemSemLiderancaUnidade('SEDE')).toBe(
      MENSAGEM_BLOQUEIO_ASSOCIACAO.sem_lideranca,
    )
    expect(mensagemSemLiderancaUnidade('SUBSEDE')).toMatch(/subsede está sem liderança/i)
    expect(mensagemSemLiderancaUnidade('PONTO_ENCONTRO')).toMatch(
      /ponto de encontro está sem liderança/i,
    )
  })
})
