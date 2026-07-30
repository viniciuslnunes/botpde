import { describe, it, expect } from 'vitest'
import {
  getWidgetsForContexto,
  getStandingsPorSerie,
  resolverWidgetsClassificacao,
} from '@torcida/types'

type WidgetFixture = NonNullable<
  NonNullable<Parameters<typeof getWidgetsForContexto>[0]>['widgets']
>[number]

function widget(overrides: Partial<WidgetFixture> & { id: string }): WidgetFixture {
  return {
    tipo: 'fixtures',
    titulo: 'Próximos jogos',
    afiliacaoSlug: 'corinthians',
    contextos: ['home', 'clube'],
    prioridade: 1,
    ativo: true,
    embedSrc: 'https://widgets.sofascore.com/embed/exemplo',
    ...overrides,
  }
}

describe('sofascore — getWidgetsForContexto', () => {
  it('retorna widget quando afiliacaoSlug e contexto batem', () => {
    const widgets = [widget({ id: 'a' })]
    const r = getWidgetsForContexto({ contexto: 'home', afiliacaoSlug: 'corinthians', widgets })
    expect(r.map((w) => w.id)).toEqual(['a'])
  })

  it('não retorna widget de outro clube', () => {
    const widgets = [widget({ id: 'a', afiliacaoSlug: 'palmeiras' })]
    const r = getWidgetsForContexto({ contexto: 'home', afiliacaoSlug: 'corinthians', widgets })
    expect(r).toEqual([])
  })

  it('não retorna widget fora do contexto', () => {
    const widgets = [widget({ id: 'a', contextos: ['clube'] })]
    const r = getWidgetsForContexto({ contexto: 'home', afiliacaoSlug: 'corinthians', widgets })
    expect(r).toEqual([])
  })

  it('não retorna widget inativo', () => {
    const widgets = [widget({ id: 'a', ativo: false })]
    const r = getWidgetsForContexto({ contexto: 'home', afiliacaoSlug: 'corinthians', widgets })
    expect(r).toEqual([])
  })

  it('ordena por prioridade ascendente', () => {
    const widgets = [
      widget({ id: 'b', prioridade: 2 }),
      widget({ id: 'a', prioridade: 1 }),
      widget({ id: 'c', prioridade: 3 }),
    ]
    const r = getWidgetsForContexto({ contexto: 'home', afiliacaoSlug: 'corinthians', widgets })
    expect(r.map((w) => w.id)).toEqual(['a', 'b', 'c'])
  })

  it('respeita limit', () => {
    const widgets = [
      widget({ id: 'a', prioridade: 1 }),
      widget({ id: 'b', prioridade: 2 }),
      widget({ id: 'c', prioridade: 3 }),
    ]
    const r = getWidgetsForContexto({
      contexto: 'home',
      afiliacaoSlug: 'corinthians',
      limit: 2,
      widgets,
    })
    expect(r.map((w) => w.id)).toEqual(['a', 'b'])
  })

  it('retorna [] sem afiliacaoSlug (nunca widget genérico)', () => {
    const widgets = [widget({ id: 'a' })]
    expect(getWidgetsForContexto({ contexto: 'home', widgets })).toEqual([])
    expect(getWidgetsForContexto({ contexto: 'home', afiliacaoSlug: null, widgets })).toEqual([])
    expect(getWidgetsForContexto()).toEqual([])
  })

  it('filtra por competicaoSlug só quando ambos definem', () => {
    const widgets = [
      widget({ id: 'geral' }),
      widget({ id: 'paulista', competicaoSlug: 'paulistao', contextos: ['campeonato', 'home'] }),
      widget({ id: 'brasileiro', competicaoSlug: 'brasileirao', contextos: ['campeonato', 'home'] }),
    ]
    const r = getWidgetsForContexto({
      contexto: 'home',
      afiliacaoSlug: 'corinthians',
      competicaoSlug: 'paulistao',
      widgets,
    })
    // widget sem competicaoSlug é "do clube em geral" e passa
    expect(r.map((w) => w.id).sort()).toEqual(['geral', 'paulista'])
  })

  it('filtra por jogadorId só quando ambos definem', () => {
    const widgets = [
      widget({ id: 'geral', contextos: ['jogador'] }),
      widget({ id: 'j10', jogadorId: '10', tipo: 'player', contextos: ['jogador'] }),
      widget({ id: 'j9', jogadorId: '9', tipo: 'player', contextos: ['jogador'] }),
    ]
    const r = getWidgetsForContexto({
      contexto: 'jogador',
      afiliacaoSlug: 'corinthians',
      jogadorId: '10',
      widgets,
    })
    expect(r.map((w) => w.id).sort()).toEqual(['geral', 'j10'])
  })

  it('retorna widget no contexto classificacao', () => {
    const widgets = [
      widget({ id: 'tabela', tipo: 'standings', contextos: ['classificacao'] }),
      widget({ id: 'jogos', contextos: ['home', 'clube'] }),
    ]
    const r = getWidgetsForContexto({
      contexto: 'classificacao',
      afiliacaoSlug: 'corinthians',
      widgets,
    })
    expect(r.map((w) => w.id)).toEqual(['tabela'])
  })
})

describe('sofascore — getStandingsPorSerie', () => {
  const competicoes = [
    {
      id: 'a',
      serie: 'A' as const,
      competicaoSlug: 'brasileirao-serie-a-2026',
      titulo: 'Série A',
      ativo: true,
      embedSrc: 'https://widgets.sofascore.com/embed/a',
    },
    {
      id: 'b',
      serie: 'B' as const,
      competicaoSlug: 'brasileirao-serie-b-2026',
      titulo: 'Série B',
      ativo: true,
      embedSrc: 'https://widgets.sofascore.com/embed/b',
    },
    {
      id: 'c-off',
      serie: 'C' as const,
      competicaoSlug: 'brasileirao-serie-c-2026',
      titulo: 'Série C',
      ativo: false,
      embedSrc: 'https://widgets.sofascore.com/embed/c',
    },
  ]

  it('retorna competição ativa das séries A e B', () => {
    expect(getStandingsPorSerie('A', { competicoes })?.id).toBe('a')
    expect(getStandingsPorSerie('B', { competicoes })?.id).toBe('b')
  })

  it('retorna null para ESTADUAL, OUTRA, null e série inativa', () => {
    expect(getStandingsPorSerie('ESTADUAL', { competicoes })).toBeNull()
    expect(getStandingsPorSerie('OUTRA', { competicoes })).toBeNull()
    expect(getStandingsPorSerie(null, { competicoes })).toBeNull()
    expect(getStandingsPorSerie(undefined, { competicoes })).toBeNull()
    expect(getStandingsPorSerie('C', { competicoes })).toBeNull()
    expect(getStandingsPorSerie('D', { competicoes })).toBeNull()
  })
})

describe('sofascore — resolverWidgetsClassificacao', () => {
  const competicoes = [
    {
      id: 'nacional-a',
      serie: 'A' as const,
      competicaoSlug: 'brasileirao-serie-a-2026',
      titulo: 'Brasileirão Série A 2026',
      ativo: true,
      embedSrc: 'https://widgets.sofascore.com/embed/nacional-a',
      alturaPx: 1123,
      creditoUrl: 'https://www.sofascore.com/a',
      creditoTexto: 'Classificação fornecida por',
    },
  ]

  it('prioriza widget específico do clube sobre a competição nacional', () => {
    const widgets = [
      widget({ id: 'clube', tipo: 'standings', contextos: ['classificacao'] }),
    ]
    const r = resolverWidgetsClassificacao({
      afiliacaoSlug: 'corinthians',
      serie: 'A',
      widgets,
      competicoes,
    })
    expect(r.map((w) => w.id)).toEqual(['clube'])
  })

  it('cai na tabela nacional da série quando o clube não tem standings próprio', () => {
    const r = resolverWidgetsClassificacao({
      afiliacaoSlug: 'palmeiras',
      serie: 'A',
      widgets: [],
      competicoes,
    })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('nacional-a')
    expect(r[0].tipo).toBe('standings')
    expect(r[0].embedSrc).toContain('nacional-a')
  })

  it('retorna [] sem afiliacaoSlug (nunca widget genérico)', () => {
    expect(
      resolverWidgetsClassificacao({ serie: 'A', widgets: [], competicoes }),
    ).toEqual([])
    expect(
      resolverWidgetsClassificacao({
        afiliacaoSlug: null,
        serie: 'A',
        widgets: [],
        competicoes,
      }),
    ).toEqual([])
  })

  it('retorna [] quando a série não tem competição ativa', () => {
    const r = resolverWidgetsClassificacao({
      afiliacaoSlug: 'guarani',
      serie: 'ESTADUAL',
      widgets: [],
      competicoes,
    })
    expect(r).toEqual([])
  })
})
