import { describe, expect, it } from 'vitest'
import {
  escopoChavePraca,
  wherePracaNoEscopo,
  podeVerArtigoNoEscopo,
  podeVerTopicoNoEscopo,
  rotuloOrigemPraca,
  prioridadeOrigemPraca,
  ordenarCardsPraca,
  pctAprovacaoPraca,
  faixaEngajamentoTopico,
  parseOrdemTopico,
  parseJanelaRanking,
  LIMIAR_RANKING_PRACA,
  tituloDeConteudoForum,
  FORUM_TITULO_MAX,
} from '@torcida/types'

describe('isolamento da praça (notícias/fórum)', () => {
  it('CN não lista artigo de tenant; tópico só do clube', () => {
    const w = wherePracaNoEscopo('nacional', { tenantId: 'sede', afiliacaoId: 'sccp' })
    expect(w.artigos).toEqual({ id: { in: [] } })
    expect(w.topicos).toEqual({ escopo: 'CLUBE', afiliacaoId: 'sccp', status: 'VISIVEL' })
  })

  it('torcida e unidade não compartilham tenantId', () => {
    const sede = wherePracaNoEscopo('torcida', { tenantId: 'sede', afiliacaoId: 'sccp' })
    const pde = wherePracaNoEscopo('unidade', { tenantId: 'pde', afiliacaoId: 'sccp' })
    expect(sede.artigos).toEqual({ tenantId: 'sede', status: 'PUBLICADO' })
    expect(pde.artigos).toEqual({ tenantId: 'pde', status: 'PUBLICADO' })
    expect(sede.artigos).not.toEqual(pde.artigos)
  })

  it('CN nunca vê artigo; PDE não vê artigo da Sede', () => {
    expect(podeVerArtigoNoEscopo('nacional', { tenantId: 'sede' }, 'sede')).toBe(false)
    expect(podeVerArtigoNoEscopo('torcida', { tenantId: 'sede' }, 'sede')).toBe(true)
    expect(podeVerArtigoNoEscopo('unidade', { tenantId: 'pde' }, 'sede')).toBe(false)
  })

  it('tópico da Sede não aparece na PDE nem na CN', () => {
    const sede = { escopo: 'TORCIDA' as const, tenantId: 'sede', afiliacaoId: null }
    const clube = { escopo: 'CLUBE' as const, tenantId: null, afiliacaoId: 'sccp' }
    expect(podeVerTopicoNoEscopo('torcida', { tenantId: 'sede', afiliacaoId: 'sccp' }, sede)).toBe(
      true,
    )
    expect(podeVerTopicoNoEscopo('unidade', { tenantId: 'pde', afiliacaoId: 'sccp' }, sede)).toBe(
      false,
    )
    expect(podeVerTopicoNoEscopo('nacional', { tenantId: null, afiliacaoId: 'sccp' }, sede)).toBe(
      false,
    )
    expect(podeVerTopicoNoEscopo('nacional', { tenantId: null, afiliacaoId: 'sccp' }, clube)).toBe(
      true,
    )
  })

  it('chave de ranking não mistura clube e torcida', () => {
    expect(escopoChavePraca({ tenantId: 'sede' })).toBe('t:sede')
    expect(escopoChavePraca({ afiliacaoId: 'sccp' })).toBe('a:sccp')
  })

  it('rótulo de origem no card', () => {
    expect(rotuloOrigemPraca('imprensa')).toBe('Imprensa')
    expect(rotuloOrigemPraca('oficial')).toBe('Oficial')
  })

  it('oficial e imprensa sobem acima de tópico no mix', () => {
    expect(prioridadeOrigemPraca('imprensa')).toBeLessThan(prioridadeOrigemPraca('forum'))
    expect(prioridadeOrigemPraca('oficial')).toBeLessThan(prioridadeOrigemPraca('verificada'))
    const ordered = ordenarCardsPraca([
      { origem: 'forum' as const, criadoEm: new Date('2026-08-30') },
      { origem: 'oficial' as const, criadoEm: new Date('2026-08-01') },
      { origem: 'imprensa' as const, criadoEm: new Date('2026-08-10') },
    ])
    expect(ordered.map((c) => c.origem)).toEqual(['imprensa', 'oficial', 'forum'])
  })

  it('% de aprovação ignora tópico sem voto', () => {
    expect(pctAprovacaoPraca(0, 0)).toBeNull()
    expect(pctAprovacaoPraca(3, 1)).toBe(75)
  })

  it('faixa épico/lendário não é cargo', () => {
    expect(faixaEngajamentoTopico({ gostei: 2, respostasCount: 1, visitas: 4 })).toBeNull()
    expect(faixaEngajamentoTopico({ gostei: 10, respostasCount: 12, visitas: 20 })).toBe('epico')
    expect(faixaEngajamentoTopico({ gostei: 40, respostasCount: 30, visitas: 80 })).toBe('lendario')
  })

  it('query de listagem/ranking tem default estável', () => {
    expect(parseOrdemTopico(undefined)).toBe('recentes')
    expect(parseOrdemTopico('populares')).toBe('populares')
    expect(parseJanelaRanking('semana')).toBe('semana')
    expect(LIMIAR_RANKING_PRACA).toBe(5)
  })

  it('título do tópico sai da primeira linha do composer', () => {
    expect(tituloDeConteudoForum('oi')).toBeNull()
    expect(tituloDeConteudoForum('Bora, Fiel!\nQuem vai no próximo jogo?')).toBe('Bora, Fiel!')
    expect(tituloDeConteudoForum('ab')).toBeNull()
    expect(tituloDeConteudoForum('abc')).toBe('abc')
    expect(tituloDeConteudoForum('x'.repeat(FORUM_TITULO_MAX + 20))).toHaveLength(FORUM_TITULO_MAX)
  })
})
