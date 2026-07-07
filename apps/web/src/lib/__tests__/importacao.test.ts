import { describe, expect, it } from 'vitest'
import { MembroImportInputSchema } from '@torcida/types'
import { dedupKey, mapTipo, mockSource } from '@/lib/importacao'

describe('dedupKey', () => {
  it('prioriza discordId sobre email e telefone', () => {
    const key = dedupKey({
      discordId: '123',
      email: 'a@b.com',
      telefone: '11 99999-0000',
      nome: 'Fulano',
      tipo: 'TORCEDOR',
    })

    expect(key).toBe('discord:123')
  })

  it('usa email quando não há discordId', () => {
    const key = dedupKey({
      email: 'A@B.com',
      telefone: '11 99999-0000',
      nome: 'Fulano',
      tipo: 'TORCEDOR',
    })

    expect(key).toBe('email:a@b.com')
  })

  it('usa telefone normalizado (só dígitos) como último recurso', () => {
    const key = dedupKey({ telefone: '(11) 99999-0000', nome: 'Fulano', tipo: 'TORCEDOR' })

    expect(key).toBe('telefone:11999990000')
  })

  it('retorna null sem nenhum identificador (registro não deduplicável)', () => {
    expect(dedupKey({ nome: 'Fulano', tipo: 'TORCEDOR' })).toBeNull()
  })

  it('nunca colide entre campos distintos (prefixo por origem)', () => {
    const porDiscord = dedupKey({ discordId: '11999990000', nome: 'A', tipo: 'TORCEDOR' })
    const porTelefone = dedupKey({ telefone: '11999990000', nome: 'B', tipo: 'TORCEDOR' })

    expect(porDiscord).not.toBe(porTelefone)
  })
})

describe('mapTipo', () => {
  it("mapeia 'socio' (case-insensitive) para SOCIO", () => {
    expect(mapTipo('socio')).toBe('SOCIO')
    expect(mapTipo('Socio')).toBe('SOCIO')
    expect(mapTipo(' SOCIO ')).toBe('SOCIO')
  })

  it("mapeia 'torcedor' para TORCEDOR", () => {
    expect(mapTipo('torcedor')).toBe('TORCEDOR')
  })

  it('valor desconhecido/nulo cai em TORCEDOR (menor privilégio)', () => {
    expect(mapTipo('presidente')).toBe('TORCEDOR')
    expect(mapTipo(null)).toBe('TORCEDOR')
    expect(mapTipo(undefined)).toBe('TORCEDOR')
  })
})

describe('mockSource', () => {
  it('gera exatamente N membros', () => {
    expect(mockSource(7)).toHaveLength(7)
    expect(mockSource(0)).toHaveLength(0)
  })

  it('todos os gerados passam no contrato MembroImportInput (Zod)', () => {
    for (const input of mockSource(50)) {
      const parsed = MembroImportInputSchema.safeParse(input)
      expect(parsed.success, JSON.stringify(input)).toBe(true)
    }
  })

  it('é determinístico: duas execuções geram os mesmos discordIds (exercita duplicados)', () => {
    const a = mockSource(10).map((m) => m.discordId)
    const b = mockSource(10).map((m) => m.discordId)

    expect(a).toEqual(b)
  })

  it('discordIds são únicos dentro do lote', () => {
    const ids = mockSource(100).map((m) => m.discordId)

    expect(new Set(ids).size).toBe(100)
  })

  it('sócios recebem numeroAssociado; torcedores não', () => {
    for (const m of mockSource(30)) {
      if (m.tipo === 'SOCIO') expect(m.numeroAssociado).toBeDefined()
      else expect(m.numeroAssociado).toBeUndefined()
    }
  })
})
