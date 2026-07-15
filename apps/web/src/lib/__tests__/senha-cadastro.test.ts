import { describe, expect, it } from 'vitest'
import { SENHAS_COMUNS, senhaCadastroSchema } from '@torcida/types'

describe('senhaCadastroSchema', () => {
  it('aceita senha com letras e número', () => {
    expect(senhaCadastroSchema.safeParse('fiel1910').success).toBe(true)
    expect(senhaCadastroSchema.safeParse('TorcidaApp9').success).toBe(true)
  })

  it('rejeita curta, só números e sem número', () => {
    expect(senhaCadastroSchema.safeParse('abc123').success).toBe(false)
    expect(senhaCadastroSchema.safeParse('12345678').success).toBe(false)
    expect(senhaCadastroSchema.safeParse('sóletras').success).toBe(false)
  })

  it('rejeita senhas da denylist', () => {
    expect(SENHAS_COMUNS.has('password1')).toBe(true)
    expect(senhaCadastroSchema.safeParse('password1').success).toBe(false)
    expect(senhaCadastroSchema.safeParse('senha123').success).toBe(false)
  })
})
