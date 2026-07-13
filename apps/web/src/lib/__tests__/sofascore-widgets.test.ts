import { describe, it, expect } from 'vitest'
import { getWidgetsForContexto } from '@torcida/types'

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
})
