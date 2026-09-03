import { describe, expect, it } from 'vitest'
import {
  achatarRespostasDaArvore,
  contarRespostasNaArvore,
  montarArvoreComentarios,
} from '../comentario-thread'

function item(id: string, parentId: string | null) {
  return { id, parentId }
}

describe('montarArvoreComentarios', () => {
  it('vários autores respondem o mesmo comentário', () => {
    const arvore = montarArvoreComentarios([
      item('raiz', null),
      item('a', 'raiz'),
      item('b', 'raiz'),
      item('c', 'raiz'),
    ])
    expect(arvore).toHaveLength(1)
    expect(arvore[0]?.respostas.map((n) => n.comentario.id)).toEqual(['a', 'b', 'c'])
  })

  it('encadeia resposta em cima de resposta', () => {
    const arvore = montarArvoreComentarios([
      item('raiz', null),
      item('r1', 'raiz'),
      item('r2', 'r1'),
    ])
    expect(arvore[0]?.respostas[0]?.comentario.id).toBe('r1')
    expect(arvore[0]?.respostas[0]?.respostas[0]?.comentario.id).toBe('r2')
  })

  it('pai ausente sobe para a raiz (não some da thread)', () => {
    const arvore = montarArvoreComentarios([item('orfao', 'sumiu'), item('raiz', null)])
    expect(arvore.map((n) => n.comentario.id)).toEqual(['orfao', 'raiz'])
  })
})

describe('achatar / contar respostas (visual Meu Timão)', () => {
  it('achata todos os níveis num único bloco sob a raiz', () => {
    const arvore = montarArvoreComentarios([
      item('raiz', null),
      item('a', 'raiz'),
      item('a1', 'a'),
      item('b', 'raiz'),
    ])
    const raiz = arvore[0]!
    expect(contarRespostasNaArvore(raiz)).toBe(3)
    expect(achatarRespostasDaArvore(raiz).map((c) => c.id)).toEqual(['a', 'a1', 'b'])
  })
})
