import { describe, expect, it } from 'vitest'
import { excedeuLimite, registrarTentativaFalha } from '../rate-limit'

describe('rate-limit de login', () => {
  it('permite login normal (sem tentativas falhas registradas)', () => {
    expect(excedeuLimite('usuario-normal@example.com')).toBe(false)
  })

  it('bloqueia após exceder o número máximo de tentativas falhas para o mesmo e-mail', () => {
    const email = 'forca-bruta@example.com'

    for (let i = 0; i < 5; i++) {
      expect(excedeuLimite(email)).toBe(false)
      registrarTentativaFalha(email)
    }

    expect(excedeuLimite(email)).toBe(true)
  })

  it('não bloqueia um e-mail diferente do que sofreu as tentativas falhas', () => {
    const emailAtacado = 'alvo@example.com'
    const outroEmail = 'nao-envolvido@example.com'

    for (let i = 0; i < 6; i++) registrarTentativaFalha(emailAtacado)

    expect(excedeuLimite(emailAtacado)).toBe(true)
    expect(excedeuLimite(outroEmail)).toBe(false)
  })

  it('normaliza e-mail por case/espaços — não permite contornar o limite variando isso', () => {
    const email = 'Contorna@Example.com'

    for (let i = 0; i < 5; i++) registrarTentativaFalha(email)

    expect(excedeuLimite('  CONTORNA@example.COM  ')).toBe(true)
  })
})
