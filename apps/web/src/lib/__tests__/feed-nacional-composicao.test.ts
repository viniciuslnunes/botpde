import { describe, expect, it, vi } from 'vitest'

/**
 * Composição do feed da Comunidade Nacional.
 *
 * O feed buscava os N posts mais recentes de `OR(sintético, seguidos,
 * alcanceNacional)` numa consulta só. As organizadas publicam mais e mais
 * recentemente, então a página inteira vinha delas e o torcedor sumia da
 * própria praça. A correção são dois baldes com cota e cursor por balde —
 * estes testes cobrem as duas peças puras disso.
 */

// Stubs dos módulos vizinhos importados por feed.ts que puxam prisma etc.
vi.mock('@torcida/db', () => ({ db: {}, Prisma: {} }))
vi.mock('@/lib/comunidade', () => ({ getFeedComunidade: vi.fn() }))
vi.mock('@/lib/comunidade-contexto', () => ({ getTenantIdsPorAfiliacao: vi.fn() }))
vi.mock('@/lib/hierarquia', () => ({
  getAncestorTenantIds: vi.fn(),
  getDescendantTenantIds: vi.fn(),
  getVisibleTenantIds: vi.fn(),
}))
vi.mock('@/lib/perfil-social', () => ({
  getAutoresSemAcesso: vi.fn(),
  getContagensSeguimentoEmLote: vi.fn(),
  resolverAvatarSocial: vi.fn(),
  podeVerConteudoSocial: vi.fn(),
  resolverPerfilPrivadoEfetivo: vi.fn(),
}))
vi.mock('@/lib/social', () => ({ getSeguimentoStatus: vi.fn() }))
vi.mock('@/lib/autor-badges', () => ({ enriquecerPostsComBadges: vi.fn() }))
vi.mock('@/lib/noticias', () => ({ getNoticiasAprovadas: vi.fn() }))

import {
  decodeCursorNacional,
  encodeCursorNacional,
  intercalarProporcional,
} from '@/lib/feed'

const CURSOR_A = { id: 'post-a', criadoEmIso: '2026-08-01T12:00:00.000Z' }
const CURSOR_B = { id: 'post-b', criadoEmIso: '2026-07-30T09:00:00.000Z' }

describe('intercalarProporcional', () => {
  it('distribui o balde menor ao longo da página, não no fim', () => {
    const grandes = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10']
    const pequenos = ['p1', 'p2']

    const out = intercalarProporcional(grandes, pequenos)

    expect(out).toHaveLength(12)
    // O que importa: os dois pequenos não ficam empilhados no fim.
    const posicoes = out.map((v, i) => (v.startsWith('p') ? i : -1)).filter((i) => i >= 0)
    expect(posicoes).toHaveLength(2)
    expect(Math.max(...posicoes)).toBeLessThan(out.length - 1)
    expect(posicoes[1]! - posicoes[0]!).toBeGreaterThan(1)
  })

  it('alterna um a um quando os baldes têm o mesmo tamanho', () => {
    expect(intercalarProporcional(['a1', 'a2'], ['b1', 'b2'])).toEqual(['a1', 'b1', 'a2', 'b2'])
  })

  it('preserva a ordem interna de cada balde', () => {
    const out = intercalarProporcional(['a1', 'a2', 'a3'], ['b1', 'b2'])
    expect(out.filter((v) => v.startsWith('a'))).toEqual(['a1', 'a2', 'a3'])
    expect(out.filter((v) => v.startsWith('b'))).toEqual(['b1', 'b2'])
  })

  it('devolve o outro balde inteiro quando um está vazio', () => {
    expect(intercalarProporcional([], ['b1', 'b2'])).toEqual(['b1', 'b2'])
    expect(intercalarProporcional(['a1'], [])).toEqual(['a1'])
    expect(intercalarProporcional<string>([], [])).toEqual([])
  })
})

describe('cursor do feed Nacional', () => {
  it('faz round-trip dos dois baldes', () => {
    const codificado = encodeCursorNacional({ torcedor: CURSOR_A, torcida: CURSOR_B })
    expect(decodeCursorNacional(codificado)).toEqual({ torcedor: CURSOR_A, torcida: CURSOR_B })
  })

  it('sem cursor, começa os dois baldes do zero', () => {
    expect(decodeCursorNacional(undefined)).toEqual({ torcedor: null, torcida: null })
  })

  it('cursor legado (formato único) vale para os dois baldes', () => {
    // Emitido pelo feed antigo; ainda pode chegar de uma aba aberta no deploy.
    const legado = Buffer.from(JSON.stringify(CURSOR_A), 'utf8').toString('base64url')
    expect(decodeCursorNacional(legado)).toEqual({ torcedor: CURSOR_A, torcida: CURSOR_A })
  })

  it('cursor corrompido não derruba o feed — recomeça do zero', () => {
    expect(decodeCursorNacional('nao-e-base64-json')).toEqual({ torcedor: null, torcida: null })
    const parcial = Buffer.from(JSON.stringify({ torcedor: { id: 'x' } }), 'utf8').toString(
      'base64url',
    )
    expect(decodeCursorNacional(parcial)).toEqual({ torcedor: null, torcida: null })
  })
})
