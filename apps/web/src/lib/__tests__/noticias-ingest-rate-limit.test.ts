import { describe, expect, it } from 'vitest'
import { excedeuLimiteIngest, registrarTentativaIngest } from '@/lib/noticias-ingest-rate-limit'

describe('rate-limit de ingestão de notícias', () => {
  it('bloqueia após exceder o limite por chave', () => {
    const key = 'ip:1.1.1.1'

    for (let i = 0; i < 20; i++) {
      expect(excedeuLimiteIngest(key)).toBe(false)
      registrarTentativaIngest(key)
    }

    expect(excedeuLimiteIngest(key)).toBe(true)
  })

  it('não compartilha bloqueio entre chaves diferentes', () => {
    const keyA = 'ip:2.2.2.2'
    const keyB = 'ip:3.3.3.3'

    for (let i = 0; i < 21; i++) registrarTentativaIngest(keyA)

    expect(excedeuLimiteIngest(keyA)).toBe(true)
    expect(excedeuLimiteIngest(keyB)).toBe(false)
  })
})
