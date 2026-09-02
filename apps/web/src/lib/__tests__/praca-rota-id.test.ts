import { describe, expect, it } from 'vitest'
import { idDeRotaPraca, idsCandidatosRotaPraca } from '../praca-rota-id'

describe('idDeRotaPraca', () => {
  it('corta a query que o App Router cola no segmento com dois-pontos', () => {
    expect(idDeRotaPraca('noticias-demo:gavioes:assembleia?escopo=torcida')).toBe(
      'noticias-demo:gavioes:assembleia',
    )
  })

  it('decodifica %3A e deixa uuid intacto', () => {
    expect(idDeRotaPraca('noticias-demo%3Agavioes%3Aassembleia')).toBe(
      'noticias-demo:gavioes:assembleia',
    )
    expect(idDeRotaPraca('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    )
  })

  it('oferece o id com hífen como fallback do seed legado', () => {
    expect(idsCandidatosRotaPraca('noticias-demo:gavioes:assembleia?escopo=torcida')).toEqual([
      'noticias-demo:gavioes:assembleia',
      'noticias-demo-gavioes-assembleia',
    ])
    expect(idsCandidatosRotaPraca('uuid-sem-colon')).toEqual(['uuid-sem-colon'])
  })
})
