import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: { AUTH_SECRET: 'test-auth-secret-associacao-32chars!!' },
}))

import {
  AtualizarMembroLgeSchema,
  CriarCobrancaSchema,
  CriarPlanoAssociacaoSchema,
  DesligarMembroSchema,
  normalizarCpf,
  validarCpfDigitos,
} from '@torcida/types'
import { montarPayloadQr, parsePayloadQr } from '@/lib/carteirinha-qr'

describe('associacao — CPF', () => {
  it('validarCpfDigitos aceita CPF válido conhecido', () => {
    expect(validarCpfDigitos('52998224725')).toBe(true)
  })

  it('rejeita sequência repetida e dígitos inválidos', () => {
    expect(validarCpfDigitos('11111111111')).toBe(false)
    expect(validarCpfDigitos('123')).toBe(false)
  })

  it('normalizarCpf extrai 11 dígitos', () => {
    expect(normalizarCpf('529.982.247-25')).toBe('52998224725')
    expect(normalizarCpf('')).toBeNull()
  })
})

describe('associacao — schemas Zod', () => {
  it('CriarPlanoAssociacaoSchema parseia valor numérico', () => {
    const parsed = CriarPlanoAssociacaoSchema.safeParse({
      nome: 'Sócio ouro',
      valor: '49.90',
      periodicidade: 'MENSAL',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.valor).toBe(49.9)
  })

  it('CriarCobrancaSchema exige vencimento ISO', () => {
    expect(
      CriarCobrancaSchema.safeParse({
        userId: '550e8400-e29b-41d4-a716-446655440000',
        descricao: 'Mensalidade teste',
        valor: 50,
        vencimento: '2026-08-10',
      }).success,
    ).toBe(true)
    expect(
      CriarCobrancaSchema.safeParse({
        userId: '550e8400-e29b-41d4-a716-446655440000',
        descricao: 'Mensalidade teste',
        valor: 50,
        vencimento: '10/08/2026',
      }).success,
    ).toBe(false)
  })

  it('AtualizarMembroLgeSchema aceita plano vazio como null', () => {
    const parsed = AtualizarMembroLgeSchema.safeParse({
      membroId: '550e8400-e29b-41d4-a716-446655440000',
      planoAssociacaoId: '',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.planoAssociacaoId).toBeNull()
  })

  it('DesligarMembroSchema exige motivo mínimo', () => {
    expect(
      DesligarMembroSchema.safeParse({
        membroId: '550e8400-e29b-41d4-a716-446655440000',
        motivo: 'abc',
      }).success,
    ).toBe(false)
  })
})

describe('associacao — QR payload roundtrip', () => {
  it('montarPayloadQr / parsePayloadQr roundtrip com AUTH_SECRET de teste', () => {
    const token = 'abc123token'
    const payload = montarPayloadQr(token)
    expect(parsePayloadQr(payload)).toBe(token)
    expect(parsePayloadQr('tampered.payload')).toBeNull()
  })
})
