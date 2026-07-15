import { describe, expect, it } from 'vitest'
import {
  NICKNAMES_RESERVADOS,
  candidatosNickname,
  normalizarNickname,
  nicknameFormSchema,
  nicknameSchema,
  sugerirNickname,
} from '@torcida/types'

describe('normalizarNickname', () => {
  it('remove @ e deixa minúsculo', () => {
    expect(normalizarNickname('@Mano_Beico')).toBe('mano_beico')
  })

  it('trim espaços', () => {
    expect(normalizarNickname('  gavioes  ')).toBe('gavioes')
  })
})

describe('sugerirNickname', () => {
  it('deriva handle do nome', () => {
    expect(sugerirNickname('Mano Beiço')).toBe('mano_beico')
  })

  it('retorna vazio quando inválido', () => {
    expect(sugerirNickname('ab')).toBe('')
    expect(sugerirNickname('admin')).toBe('')
  })
})

describe('candidatosNickname', () => {
  it('inclui base e variantes numéricas', () => {
    const lista = candidatosNickname('Mano Beiço')
    expect(lista[0]).toBe('mano_beico')
    expect(lista).toContain('mano_beico1')
    expect(lista).toContain('mano_beico_1')
  })

  it('ancora reservados com sufixo', () => {
    const lista = candidatosNickname('Admin')
    expect(lista.length).toBeGreaterThan(0)
    expect(lista[0]).toMatch(/^admin/)
    expect(lista.every((n) => nicknameSchema.safeParse(n).success)).toBe(true)
  })
})

describe('nicknameSchema', () => {
  it('aceita handle válido', () => {
    expect(nicknameSchema.safeParse('mano_beico').success).toBe(true)
    expect(nicknameSchema.parse('@Mano_Beico')).toBe('mano_beico')
  })

  it('rejeita curto, acento, só número e reservado', () => {
    expect(nicknameSchema.safeParse('ab').success).toBe(false)
    expect(nicknameSchema.safeParse('mão').success).toBe(false)
    expect(nicknameSchema.safeParse('12345').success).toBe(false)
    expect(nicknameSchema.safeParse('admin').success).toBe(false)
    expect(NICKNAMES_RESERVADOS.has('torcida')).toBe(true)
  })
})

describe('nicknameFormSchema', () => {
  it('string vazia vira null', () => {
    expect(nicknameFormSchema.parse('')).toBe(null)
    expect(nicknameFormSchema.parse('   ')).toBe(null)
  })

  it('normaliza valor preenchido', () => {
    expect(nicknameFormSchema.parse('@Fiel_1910')).toBe('fiel_1910')
  })
})
