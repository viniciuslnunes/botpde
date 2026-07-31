import { describe, it, expect } from 'vitest'
import {
  AbrirComandaBarSchema,
  FecharComandaBarSchema,
  CancelarComandaBarSchema,
  LIMITE_COMANDA_PADRAO,
  saldoComanda,
  limiteEfetivoComanda,
  percentualLimite,
  round2,
  somarRecebidoBar,
  montarResumoRecebidoBar,
  somarConsumoEmAbertoBar,
} from '@torcida/types'

const UUID = '4c9c1f9e-8f7a-4b2e-9c5d-1a2b3c4d5e6f'

describe('bar-comanda — helpers', () => {
  it('saldoComanda = total − desconto − totalPago (round2)', () => {
    expect(saldoComanda({ total: 100, desconto: 10, totalPago: 30 })).toBe(60)
    expect(saldoComanda({ total: 10.555, desconto: 0, totalPago: 0 })).toBe(10.56)
    expect(saldoComanda({ total: 50, desconto: 0, totalPago: 50 })).toBe(0)
  })

  it('limiteEfetivoComanda: override > padrão; null desliga', () => {
    expect(limiteEfetivoComanda(200, LIMITE_COMANDA_PADRAO)).toBe(200)
    expect(limiteEfetivoComanda(null, LIMITE_COMANDA_PADRAO)).toBe(150)
    expect(limiteEfetivoComanda(undefined, null)).toBeNull()
    expect(limiteEfetivoComanda(null, null)).toBeNull()
  })

  it('percentualLimite: 80% e null se desligado', () => {
    expect(percentualLimite(120, 150)).toBe(80)
    expect(percentualLimite(75, 150)).toBe(50)
    expect(percentualLimite(100, null)).toBeNull()
    expect(percentualLimite(10, 0)).toBeNull()
  })

  it('LIMITE_COMANDA_PADRAO é 150', () => {
    expect(LIMITE_COMANDA_PADRAO).toBe(150)
  })

  it('round2 consistente', () => {
    expect(round2(1.005)).toBe(1)
    expect(round2(10.556)).toBe(10.56)
  })
})

describe('bar-comanda — Recebido × Consumo em aberto (fase 5)', () => {
  it('somarRecebidoBar = vendas rápidas + pagamentos de comanda', () => {
    expect(somarRecebidoBar(40, 25.5)).toBe(65.5)
    expect(somarRecebidoBar(0, 0)).toBe(0)
  })

  it('montarResumoRecebidoBar não conta EM_COMANDA (só as partes passadas)', () => {
    const r = montarResumoRecebidoBar({
      vendasRapidasTotal: 30,
      vendasRapidasCount: 2,
      pagamentosComandaTotal: 20,
      pagamentosComandaCount: 1,
    })
    expect(r).toEqual({ totalVendas: 50, totalPago: 50, quantidade: 3 })
  })

  it('somarConsumoEmAbertoBar soma total − desconto das ABERTA', () => {
    expect(
      somarConsumoEmAbertoBar([
        { total: 100, desconto: 10 },
        { total: 40, desconto: 0 },
      ]),
    ).toBe(130)
    expect(somarConsumoEmAbertoBar([])).toBe(0)
  })
})

describe('bar-comanda — AbrirComandaBarSchema', () => {
  it('aceita MEMBRO com membroId', () => {
    const r = AbrirComandaBarSchema.safeParse({
      codigo: 'Mesa 3',
      tipo: 'MEMBRO',
      membroId: UUID,
    })
    expect(r.success).toBe(true)
  })

  it('rejeita MEMBRO sem membroId', () => {
    const r = AbrirComandaBarSchema.safeParse({
      codigo: 'Mesa 3',
      tipo: 'MEMBRO',
    })
    expect(r.success).toBe(false)
  })

  it('aceita AVULSO com titularNome ≥ 2', () => {
    const r = AbrirComandaBarSchema.safeParse({
      codigo: 'Balcão',
      tipo: 'AVULSO',
      titularNome: 'João',
    })
    expect(r.success).toBe(true)
  })

  it('rejeita AVULSO com nome curto', () => {
    const r = AbrirComandaBarSchema.safeParse({
      codigo: 'Balcão',
      tipo: 'AVULSO',
      titularNome: 'J',
    })
    expect(r.success).toBe(false)
  })
})

describe('bar-comanda — FecharComandaBarSchema', () => {
  it('aceita fechamento com pagamentos e desconto 0', () => {
    const r = FecharComandaBarSchema.safeParse({
      comandaId: UUID,
      pagamentos: [{ metodo: 'DINHEIRO', valor: 40 }],
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.desconto).toBe(0)
  })

  it('exige motivoDesconto quando desconto > 0', () => {
    const r = FecharComandaBarSchema.safeParse({
      comandaId: UUID,
      desconto: 5,
      pagamentos: [{ metodo: 'DINHEIRO', valor: 35 }],
    })
    expect(r.success).toBe(false)
  })

  it('aceita desconto com motivo', () => {
    const r = FecharComandaBarSchema.safeParse({
      comandaId: UUID,
      desconto: 5,
      motivoDesconto: 'Cortesia do presidente',
      pagamentos: [{ metodo: 'DINHEIRO', valor: 35 }],
      vencimento: '2026-08-15',
    })
    expect(r.success).toBe(true)
  })

  it('rejeita FIADO como método de pagamento da comanda', () => {
    const r = FecharComandaBarSchema.safeParse({
      comandaId: UUID,
      pagamentos: [{ metodo: 'FIADO', valor: 10 }],
    })
    expect(r.success).toBe(false)
  })
})

describe('bar-comanda — CancelarComandaBarSchema', () => {
  it('exige motivo ≥ 3', () => {
    expect(
      CancelarComandaBarSchema.safeParse({ comandaId: UUID, motivo: 'ab' }).success,
    ).toBe(false)
    expect(
      CancelarComandaBarSchema.safeParse({ comandaId: UUID, motivo: 'Perdão de dívida' })
        .success,
    ).toBe(true)
  })
})

describe('bar — FecharTurnoBarSchema (ciência comandas)', () => {
  it('aceita cienciaComandasAbertas opcional', async () => {
    const { FecharTurnoBarSchema } = await import('@torcida/types')
    expect(
      FecharTurnoBarSchema.safeParse({
        dinheiroContado: 100,
        sangria: 0,
        cienciaComandasAbertas: true,
      }).success,
    ).toBe(true)
    expect(
      FecharTurnoBarSchema.safeParse({
        dinheiroContado: 50,
      }).success,
    ).toBe(true)
  })
})
