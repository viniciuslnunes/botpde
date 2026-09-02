import { describe, expect, it } from 'vitest'
import {
  formatMetaNoticia,
  particionarNoticiasFeed,
  rotuloCategoriaNoticia,
} from '@/lib/noticias-feed-layout'
import type { NoticiaPracaItem } from '@/lib/praca'

function item(partial: Partial<NoticiaPracaItem> & Pick<NoticiaPracaItem, 'id' | 'titulo'>): NoticiaPracaItem {
  return {
    kind: 'artigo',
    resumo: null,
    corpo: null,
    midiaUrls: [],
    midiaPrincipal: null,
    duracaoSegundos: null,
    relacionados: [],
    origem: 'oficial',
    publicadoEm: new Date('2026-08-01T12:00:00Z'),
    criadoEm: new Date('2026-08-01T12:00:00Z'),
    visitas: 0,
    gostei: 0,
    naoGostei: 0,
    fixado: false,
    autorId: null,
    autorNome: null,
    fonte: null,
    url: null,
    ...partial,
  }
}

describe('particionarNoticiasFeed', () => {
  it('mantém lista inteira com menos de 3 itens', () => {
    const a = item({ id: 'a', titulo: 'A' })
    const b = item({ id: 'b', titulo: 'B' })
    expect(particionarNoticiasFeed([a, b])).toEqual({ destaques: [], lista: [a, b] })
  })

  it('separa 3 destaques e o restante na lista', () => {
    const itens = ['a', 'b', 'c', 'd'].map((id) => item({ id, titulo: id }))
    const { destaques, lista } = particionarNoticiasFeed(itens)
    expect(destaques.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(lista.map((i) => i.id)).toEqual(['d'])
  })
})

describe('rotuloCategoriaNoticia', () => {
  it('prioriza fonte da imprensa', () => {
    expect(
      rotuloCategoriaNoticia(item({ id: 'x', titulo: 't', origem: 'imprensa', fonte: 'GE' })),
    ).toBe('GE')
  })

  it('usa origem em minúsculas sem fonte', () => {
    expect(rotuloCategoriaNoticia(item({ id: 'x', titulo: 't', origem: 'oficial' }))).toBe('oficial')
  })
})

describe('formatMetaNoticia', () => {
  it('capitaliza o tempo relativo e inclui categoria', () => {
    const texto = formatMetaNoticia(
      item({
        id: 'x',
        titulo: 't',
        origem: 'imprensa',
        fonte: 'ge',
        publicadoEm: new Date(Date.now() - 3_600_000),
      }),
    )
    expect(texto).toMatch(/^Há \d+ h — Em ge$/)
  })
})
