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
  aplicarVotoPracaLocal,
  contagemExibidaVotoPraca,
  proximoVotoPraca,
  faixaEngajamentoTopico,
  parseOrdemTopico,
  parseOrdemNoticia,
  parseJanelaRanking,
  parseForumAba,
  LIMIAR_RANKING_PRACA,
  tituloDeConteudoForum,
  FORUM_TITULO_MAX,
  wilsonLowerBound,
  scoreHotTopico,
  rankTopicosHot,
  rankNoticiasHot,
  resumoDeCorpoForum,
  podeVerStatusTopico,
  whereTopicosNaListagem,
  canalElegivelParaNoticia,
  parseArtigoBlocos,
  flattenArtigoBlocos,
  blocosDeArtigoLegado,
  tipoBlocoDeUrl,
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

  it('trocar Concordo por Discordo não pula duas unidades no número exibido', () => {
    expect(proximoVotoPraca(null, 1)).toBe(1)
    expect(proximoVotoPraca(null, -1)).toBe(-1)
    expect(proximoVotoPraca(1, 1)).toBe(0)
    expect(proximoVotoPraca(1, -1)).toBe(0)
    expect(proximoVotoPraca(-1, 1)).toBe(0)

    const aposConcordo = aplicarVotoPracaLocal(5, 0, null, proximoVotoPraca(null, 1))
    expect(aposConcordo).toEqual({ gostei: 6, naoGostei: 0 })
    expect(contagemExibidaVotoPraca(aposConcordo.gostei, aposConcordo.naoGostei)).toBe(6)

    const aposOposto = aplicarVotoPracaLocal(
      aposConcordo.gostei,
      aposConcordo.naoGostei,
      1,
      proximoVotoPraca(1, -1),
    )
    expect(aposOposto).toEqual({ gostei: 5, naoGostei: 0 })
    expect(contagemExibidaVotoPraca(aposOposto.gostei, aposOposto.naoGostei)).toBe(5)

    const aposDiscordoDireto = aplicarVotoPracaLocal(5, 0, null, proximoVotoPraca(null, -1))
    expect(contagemExibidaVotoPraca(aposDiscordoDireto.gostei, aposDiscordoDireto.naoGostei)).toBe(4)
  })

  it('faixa épico/lendário não é cargo', () => {
    expect(faixaEngajamentoTopico({ gostei: 2, respostasCount: 1, visitas: 4 })).toBeNull()
    expect(faixaEngajamentoTopico({ gostei: 10, respostasCount: 12, visitas: 20 })).toBe('epico')
    expect(faixaEngajamentoTopico({ gostei: 40, respostasCount: 30, visitas: 80 })).toBe('lendario')
  })

  it('query de listagem/ranking tem default estável', () => {
    expect(parseOrdemTopico(undefined)).toBe('em_alta')
    expect(parseOrdemTopico('populares')).toBe('em_alta')
    expect(parseOrdemTopico('recentes')).toBe('recentes')
    expect(parseJanelaRanking('semana')).toBe('semana')
    expect(parseForumAba(undefined)).toBe('topicos')
    expect(parseForumAba('ranking')).toBe('ranking')
    expect(parseForumAba(undefined, '1')).toBe('novo')
    expect(LIMIAR_RANKING_PRACA).toBe(5)
  })

  it('notícia defaulta em mais acessadas; fórum defaulta em alta', () => {
    expect(parseOrdemNoticia(undefined)).toBe('acessados')
    expect(parseOrdemNoticia('em_alta')).toBe('em_alta')
    expect(parseOrdemNoticia('lixo')).toBe('acessados')
    expect(parseOrdemTopico(undefined)).toBe('em_alta')
  })

  it('só canal oficial da torcida/unidade ou portal verificado publica notícia', () => {
    expect(canalElegivelParaNoticia({ tipo: 'CANAL', canalOficial: true })).toBe(true)
    expect(canalElegivelParaNoticia({ tipo: 'CANAL', portalNoticiasVerificado: true })).toBe(true)
    expect(canalElegivelParaNoticia({ tipo: 'CANAL' })).toBe(false)
    expect(canalElegivelParaNoticia({ tipo: 'GRUPO', canalOficial: true })).toBe(false)
    expect(canalElegivelParaNoticia(null)).toBe(false)
  })

  it('ranking de notícias reusa o score do fórum (mais vistas no recorte acessados)', () => {
    const agora = new Date('2026-09-01T12:00:00Z')
    const ranked = rankNoticiasHot(
      [
        {
          id: 'fria',
          status: 'PUBLICADO',
          fixado: false,
          gostei: 0,
          naoGostei: 0,
          criadoEm: agora,
          atualizadoEm: agora,
        },
        {
          id: 'quente',
          status: 'PUBLICADO',
          fixado: false,
          gostei: 20,
          naoGostei: 1,
          criadoEm: agora,
          atualizadoEm: agora,
          midiaUrls: ['https://cdn.example/a.jpg'],
        },
        {
          id: 'fixada',
          status: 'PUBLICADO',
          fixado: true,
          gostei: 0,
          naoGostei: 0,
          criadoEm: agora,
          atualizadoEm: agora,
        },
      ],
      agora,
    )
    expect(ranked.map((t) => t.id)).toEqual(['fixada', 'quente', 'fria'])
  })

  it('Wilson não deixa 1 voto positivo passar na frente de consenso', () => {
    expect(wilsonLowerBound(1, 0)).toBeLessThan(wilsonLowerBound(48, 2))
    expect(wilsonLowerBound(0, 0)).toBe(0)
  })

  it('tópico quente sobe; rejeição positiva pesa; mídia dá boost', () => {
    const agora = new Date('2026-09-01T12:00:00Z')
    const fresco = {
      gostei: 12,
      naoGostei: 1,
      respostasCount: 8,
      criadoEm: new Date('2026-09-01T06:00:00Z'),
      midiaUrls: ['https://cdn.example/a.jpg'],
    }
    const velho = {
      gostei: 12,
      naoGostei: 1,
      respostasCount: 8,
      criadoEm: new Date('2026-07-01T06:00:00Z'),
      midiaUrls: [],
    }
    const odiado = {
      gostei: 2,
      naoGostei: 20,
      respostasCount: 30,
      criadoEm: new Date('2026-09-01T06:00:00Z'),
      midiaUrls: [],
    }
    expect(scoreHotTopico(fresco, agora)).toBeGreaterThan(scoreHotTopico(velho, agora))
    expect(scoreHotTopico(fresco, agora)).toBeGreaterThan(scoreHotTopico(odiado, agora))
  })

  it('rank em alta: pendente acima, fixado acima, depois score', () => {
    const agora = new Date('2026-09-01T12:00:00Z')
    const ranked = rankTopicosHot(
      [
        {
          id: 'frio',
          status: 'VISIVEL',
          fixado: false,
          gostei: 0,
          naoGostei: 0,
          respostasCount: 0,
          criadoEm: agora,
          atualizadoEm: agora,
        },
        {
          id: 'quente',
          status: 'VISIVEL',
          fixado: false,
          gostei: 20,
          naoGostei: 1,
          respostasCount: 10,
          criadoEm: agora,
          atualizadoEm: agora,
          midiaUrls: ['https://cdn.example/a.jpg'],
        },
        {
          id: 'fila',
          status: 'PENDENTE',
          fixado: false,
          gostei: 0,
          naoGostei: 0,
          respostasCount: 0,
          criadoEm: agora,
          atualizadoEm: agora,
        },
      ],
      agora,
    )
    expect(ranked.map((t) => t.id)).toEqual(['fila', 'quente', 'frio'])
  })

  it('resumo do tópico pula a linha do título', () => {
    expect(resumoDeCorpoForum('Bora', 'Bora\nQuem vai no jogo?')).toBe('Quem vai no jogo?')
    expect(resumoDeCorpoForum('Bora', 'Bora')).toBeNull()
  })

  it('pendente/rejeitado só autor ou moderação vê', () => {
    expect(podeVerStatusTopico('VISIVEL', { autorId: 'a' })).toBe(true)
    expect(podeVerStatusTopico('PENDENTE', { autorId: 'a', userId: 'x' })).toBe(false)
    expect(podeVerStatusTopico('PENDENTE', { autorId: 'a', userId: 'a' })).toBe(true)
    expect(podeVerStatusTopico('REJEITADO', { autorId: 'a', userId: 'm', podeModerar: true })).toBe(
      true,
    )
  })

  it('listagem mistura VISIVEL com fila do autor/moderação', () => {
    const w = whereTopicosNaListagem(
      'torcida',
      { tenantId: 'sede', afiliacaoId: 'sccp' },
      { userId: 'u1', podeModerar: true },
    )
    expect(w.escopo).toBe('TORCIDA')
    expect(w.tenantId).toBe('sede')
    expect(w.OR).toEqual(
      expect.arrayContaining([
        { status: 'VISIVEL' },
        { status: 'PENDENTE', autorId: 'u1' },
        { status: 'PENDENTE' },
      ]),
    )
  })

  it('título do tópico sai da primeira linha do composer', () => {
    expect(tituloDeConteudoForum('oi')).toBeNull()
    expect(tituloDeConteudoForum('Bora, Fiel!\nQuem vai no próximo jogo?')).toBe('Bora, Fiel!')
    expect(tituloDeConteudoForum('ab')).toBeNull()
    expect(tituloDeConteudoForum('abc')).toBe('abc')
    expect(tituloDeConteudoForum('x'.repeat(FORUM_TITULO_MAX + 20))).toHaveLength(FORUM_TITULO_MAX)
  })

  it('classifica URL de bloco de notícia', () => {
    expect(tipoBlocoDeUrl('https://www.youtube.com/watch?v=abc')).toBe('embed')
    expect(tipoBlocoDeUrl('https://instagram.com/p/xyz')).toBe('embed')
    expect(tipoBlocoDeUrl('https://res.cloudinary.com/x/video/upload/v1/a.mp4')).toBe('video')
    expect(tipoBlocoDeUrl('https://images.unsplash.com/photo-1')).toBe('imagem')
  })

  it('história em blocos deriva capa, mídia e corpo na ordem da leitura', () => {
    const blocos = parseArtigoBlocos([
      { tipo: 'texto', texto: 'Primeiro parágrafo da matéria.' },
      { tipo: 'imagem', url: 'https://cdn.example/a.jpg', legenda: 'Ensaio' },
      { tipo: 'embed', url: 'https://www.youtube.com/watch?v=abc' },
      { tipo: 'texto', texto: 'Fecha a história.' },
      { tipo: 'lixo', texto: 'não entra' },
    ])
    expect(blocos.map((b) => b.tipo)).toEqual(['texto', 'imagem', 'embed', 'texto'])
    const flat = flattenArtigoBlocos(blocos)
    expect(flat.capaUrl).toBe('https://cdn.example/a.jpg')
    expect(flat.midiaUrls).toEqual([
      'https://cdn.example/a.jpg',
      'https://www.youtube.com/watch?v=abc',
    ])
    expect(flat.corpo).toContain('Primeiro parágrafo')
    expect(flat.corpo).toContain('Fecha a história')
    expect(flat.resumo).toBe('Primeiro parágrafo da matéria.')
  })

  it('artigo legado (corpo + URLs) vira a mesma sequência de leitura', () => {
    const blocos = blocosDeArtigoLegado('Texto da sede.\n\nSegundo bloco.', [
      'https://cdn.example/foto.jpg',
      'https://www.tiktok.com/@x/video/1',
    ])
    expect(blocos[0]).toEqual({ tipo: 'imagem', url: 'https://cdn.example/foto.jpg' })
    expect(blocos[1]).toEqual({ tipo: 'embed', url: 'https://www.tiktok.com/@x/video/1' })
    expect(blocos[2]).toEqual({ tipo: 'texto', texto: 'Texto da sede.\n\nSegundo bloco.' })
  })
})
