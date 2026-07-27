import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: { AUTH_SECRET: 'test-auth-secret-associacao-32chars!!' },
}))

import {
  AtualizarMembroLgeSchema,
  CriarCobrancaSchema,
  CriarPlanoAssociacaoSchema,
  DesligarMembroSchema,
  formatRg,
  maskRg,
  maskTelefone,
  normalizarCpf,
  normalizarRg,
  normalizarTelefone,
  validarCpfDigitos,
  validarRg,
  validarTelefoneBr,
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

describe('associacao — telefone', () => {
  it('normalizarTelefone aceita fixo e celular mascarados', () => {
    expect(normalizarTelefone('(11) 98888-7777')).toBe('11988887777')
    expect(normalizarTelefone('(11) 3333-4444')).toBe('1133334444')
    expect(normalizarTelefone('11988887777')).toBe('11988887777')
    expect(normalizarTelefone('123')).toBeNull()
    expect(validarTelefoneBr('(11) 98888-7777')).toBe(true)
    expect(validarTelefoneBr('00')).toBe(false)
    expect(maskTelefone('11988887777')).toBe('(11) 98888-7777')
  })
})

describe('associacao — RG', () => {
  it('normalizarRg aceita máscara e verificador X', () => {
    expect(normalizarRg('12.345.678-9')).toBe('123456789')
    expect(normalizarRg('12.345.678-X')).toBe('12345678X')
    expect(normalizarRg('')).toBeNull()
    expect(normalizarRg('123')).toBeNull()
  })

  it('validarRg rejeita sequência repetida e formato inválido', () => {
    expect(validarRg('12.345.678-9')).toBe(true)
    expect(validarRg('111111111')).toBe(false)
    expect(validarRg('12')).toBe(false)
    expect(validarRg('X12345678')).toBe(false)
  })

  it('maskRg / formatRg aplicam máscara SP', () => {
    expect(maskRg('123456789')).toBe('12.345.678-9')
    expect(maskRg('12345678x')).toBe('12.345.678-X')
    expect(formatRg('123456789')).toBe('12.345.678-9')
    expect(formatRg(null)).toBeNull()
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

  it('AtualizarMembroLgeSchema rejeita RG inválido e normaliza RG válido', () => {
    const invalid = AtualizarMembroLgeSchema.safeParse({
      membroId: '550e8400-e29b-41d4-a716-446655440000',
      rg: '111111111',
    })
    expect(invalid.success).toBe(false)

    const valid = AtualizarMembroLgeSchema.safeParse({
      membroId: '550e8400-e29b-41d4-a716-446655440000',
      rg: '12.345.678-9',
    })
    expect(valid.success).toBe(true)
    if (valid.success) expect(valid.data.rg).toBe('123456789')
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
