import { describe, expect, it } from 'vitest'
import {
  RECURSO_SENSIBILIDADE,
  aplicarIsolamento,
  recursoCascateiaParaIsolado,
  type TenantRelation,
} from '@torcida/types'

/**
 * R5 — canal restrito. A primitiva é pura e mora em `@torcida/types`; quem lê o
 * estado é `lib/isolamento.ts`. A regra é assimétrica de propósito — ver o
 * JSDoc de `aplicarIsolamento`.
 */
describe('aplicarIsolamento', () => {
  const RELACOES: TenantRelation[] = [
    'self',
    'ancestor',
    'descendant',
    'allied',
    'rival',
    'unrelated',
  ]

  it('é no-op quando nenhum dos lados tem canal restrito', () => {
    for (const relation of RELACOES) {
      expect(aplicarIsolamento(relation, { atorRestrito: false, alvoRestrito: false })).toBe(
        relation,
      )
    }
  })

  it('nunca afeta o próprio tenant — a comunidade interna segue intacta', () => {
    expect(aplicarIsolamento('self', { atorRestrito: true, alvoRestrito: true })).toBe('self')
  })

  it('alvo restrito some para todo mundo, inclusive para o ancestral', () => {
    for (const relation of RELACOES.filter((r) => r !== 'self')) {
      expect(aplicarIsolamento(relation, { alvoRestrito: true })).toBe('unrelated')
    }
  })

  it('ator restrito também deixa de ver o feed da Sede — o corte é nos dois sentidos', () => {
    expect(aplicarIsolamento('descendant', { atorRestrito: true })).toBe('unrelated')
  })

  it('ator restrito preserva ancestor — isolar-se para fora não a cega para dentro', () => {
    // Unidade restrita que tem sub-unidades próprias continua enxergando-as:
    // a árvore para BAIXO não é "externo".
    expect(aplicarIsolamento('ancestor', { atorRestrito: true })).toBe('ancestor')
  })

  it('ator restrito perde aliados, coirmãs e rivais', () => {
    expect(aplicarIsolamento('allied', { atorRestrito: true })).toBe('unrelated')
    expect(aplicarIsolamento('unrelated', { atorRestrito: true })).toBe('unrelated')
    expect(aplicarIsolamento('rival', { atorRestrito: true })).toBe('unrelated')
  })

  it('isolamento dos dois lados: alvo restrito vence (ninguém enxerga a unidade)', () => {
    expect(aplicarIsolamento('descendant', { atorRestrito: true, alvoRestrito: true })).toBe(
      'unrelated',
    )
  })

  it('trata estado ausente como não restrito', () => {
    expect(aplicarIsolamento('allied', {})).toBe('allied')
  })
})

/**
 * O que a unidade isolada CONTINUA recebendo da Sede. Isolamento corta
 * interação; comunicação institucional segue descendo.
 */
describe('recursoCascateiaParaIsolado', () => {
  it('deixa passar comunicado e evento', () => {
    expect(recursoCascateiaParaIsolado('comunicados')).toBe(true)
    expect(recursoCascateiaParaIsolado('eventos')).toBe(true)
  })

  it('barra o feed da comunidade e o resto da praça social', () => {
    expect(recursoCascateiaParaIsolado('comunidade')).toBe(false)
    expect(recursoCascateiaParaIsolado('memoria')).toBe(false)
    expect(recursoCascateiaParaIsolado('loja')).toBe(false)
    expect(recursoCascateiaParaIsolado('sedes')).toBe(false)
  })

  it('todo recurso da lista existe na matriz de sensibilidade', () => {
    // Invariante contra renomear um recurso e a cascata virar no-op silencioso.
    for (const recurso of ['comunicados', 'eventos'] as const) {
      expect(RECURSO_SENSIBILIDADE[recurso]).toBeDefined()
    }
  })
})
