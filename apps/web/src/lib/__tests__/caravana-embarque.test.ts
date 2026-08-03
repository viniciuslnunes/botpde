import { describe, it, expect } from 'vitest'
import {
  deveBloquearCheckInSemPagamento,
  lotacaoPorPagamento,
  resolverStatusVaga,
  resumirEmbarqueComPagamento,
  temValorVaga,
} from '@torcida/types'

describe('temValorVaga', () => {
  it('null/0/negativo = caravana sem preço', () => {
    expect(temValorVaga(null)).toBe(false)
    expect(temValorVaga(undefined)).toBe(false)
    expect(temValorVaga(0)).toBe(false)
    expect(temValorVaga(-10)).toBe(false)
    expect(temValorVaga('')).toBe(false)
  })

  it('aceita número e string Decimal-like', () => {
    expect(temValorVaga(80)).toBe(true)
    expect(temValorVaga('80.00')).toBe(true)
  })
})

describe('resolverStatusVaga', () => {
  it('sem valorVaga: NAO_APLICA, sem alerta', () => {
    const s = resolverStatusVaga({ valorVaga: null, cobrancaStatus: null })
    expect(s.pagamento).toBe('NAO_APLICA')
    expect(s.alerta).toBe(false)
    expect(s.embarque).toBe('AGUARDANDO')
  })

  it('pago e embarcado', () => {
    const s = resolverStatusVaga({
      valorVaga: 80,
      cobrancaStatus: 'PAGA',
      checkedInAt: new Date(),
    })
    expect(s).toMatchObject({
      pagamento: 'PAGO',
      embarque: 'EMBARCADO',
      alerta: false,
      labelPagamento: 'Pago',
    })
  })

  it('pendente gera alerta — check-in avisa e permite', () => {
    const s = resolverStatusVaga({
      valorVaga: 80,
      cobrancaStatus: 'PENDENTE',
      checkedInAt: null,
    })
    expect(s.pagamento).toBe('PENDENTE')
    expect(s.alerta).toBe(true)
  })

  it('confirmou e nunca gerou cobrança = SEM_COBRANCA com alerta', () => {
    const s = resolverStatusVaga({ valorVaga: 120, cobrancaStatus: null })
    expect(s.pagamento).toBe('SEM_COBRANCA')
    expect(s.alerta).toBe(true)
    expect(s.labelPagamento).toBe('Sem cobrança')
  })

  it('cancelada / vencida alertam', () => {
    expect(resolverStatusVaga({ valorVaga: 50, cobrancaStatus: 'CANCELADA' }).alerta).toBe(
      true,
    )
    expect(resolverStatusVaga({ valorVaga: 50, cobrancaStatus: 'VENCIDA' }).pagamento).toBe(
      'VENCIDA',
    )
  })
})

describe('lotacaoPorPagamento', () => {
  it('só com valor de vaga', () => {
    expect(lotacaoPorPagamento(null)).toBe(false)
    expect(lotacaoPorPagamento(0)).toBe(false)
    expect(lotacaoPorPagamento(80)).toBe(true)
  })
})

describe('deveBloquearCheckInSemPagamento', () => {
  it('default (flag off) nunca bloqueia', () => {
    expect(
      deveBloquearCheckInSemPagamento({
        checkInExigePagamento: false,
        valorVaga: 80,
        alerta: true,
      }),
    ).toBe(false)
  })

  it('flag on + alerta bloqueia; override libera', () => {
    expect(
      deveBloquearCheckInSemPagamento({
        checkInExigePagamento: true,
        valorVaga: 80,
        alerta: true,
      }),
    ).toBe(true)
    expect(
      deveBloquearCheckInSemPagamento({
        checkInExigePagamento: true,
        valorVaga: 80,
        alerta: true,
        override: true,
      }),
    ).toBe(false)
  })

  it('pago (sem alerta) ou sem valorVaga não bloqueia', () => {
    expect(
      deveBloquearCheckInSemPagamento({
        checkInExigePagamento: true,
        valorVaga: 80,
        alerta: false,
      }),
    ).toBe(false)
    expect(
      deveBloquearCheckInSemPagamento({
        checkInExigePagamento: true,
        valorVaga: null,
        alerta: true,
      }),
    ).toBe(false)
  })
})

describe('resumirEmbarqueComPagamento', () => {
  it('conta pagos faltando e embarcados sem pagar', () => {
    const resumo = resumirEmbarqueComPagamento([
      {
        pagamento: 'PAGO',
        embarque: 'EMBARCADO',
        alerta: false,
        labelPagamento: 'Pago',
      },
      {
        pagamento: 'PAGO',
        embarque: 'AGUARDANDO',
        alerta: false,
        labelPagamento: 'Pago',
      },
      {
        pagamento: 'PENDENTE',
        embarque: 'EMBARCADO',
        alerta: true,
        labelPagamento: 'Pendente',
      },
      {
        pagamento: 'SEM_COBRANCA',
        embarque: 'AGUARDANDO',
        alerta: true,
        labelPagamento: 'Sem cobrança',
      },
      {
        pagamento: 'NAO_APLICA',
        embarque: 'EMBARCADO',
        alerta: false,
        labelPagamento: 'Sem cobrança',
        confirmado: true,
      },
    ])

    expect(resumo.confirmados).toBe(5)
    expect(resumo.embarcados).toBe(3)
    expect(resumo.pagos).toBe(2)
    expect(resumo.pagosEmbarcados).toBe(1)
    expect(resumo.pagosFaltando).toBe(1)
    expect(resumo.embarcadosSemPagar).toBe(1)
    expect(resumo.pendentesPagamento).toBe(1)
  })
})
