import { describe, expect, it } from 'vitest'
import { extrairMetaArtigoBlocos, midiaPrincipalDeUrls } from '@/lib/noticias-artigo-meta'

describe('extrairMetaArtigoBlocos', () => {
  it('lê relacionados e duração de vídeo', () => {
    const meta = extrairMetaArtigoBlocos([
      { tipo: 'texto', texto: 'Corpo' },
      {
        tipo: 'relacionados',
        itens: [{ artigoId: 'a1', titulo: 'Matéria irmã' }],
      },
      { tipo: 'embed', url: 'https://www.youtube.com/shorts/abc', duracaoSegundos: 42 },
    ])
    expect(meta.relacionados).toEqual([{ id: 'a1', titulo: 'Matéria irmã' }])
    expect(meta.duracaoSegundos).toBe(42)
  })
})

describe('midiaPrincipalDeUrls', () => {
  it('detecta embed do YouTube', () => {
    expect(midiaPrincipalDeUrls(['https://www.youtube.com/shorts/abc'])).toBe('embed')
  })
})
