import { describe, expect, it } from 'vitest'
import {
  agruparEspinhaPorMes,
  clampDiaIso,
  diaNoMesVizinho,
  diasDoMes,
  diasEmTorno,
  filtrarEspinha,
  isMemoriaDiaIso,
  janelaDoMes,
  janelaMemoria,
  limitesCalendarioMemoria,
  montarEspinhaCalendario,
  montarMemoria,
  resolverDiaInicial,
  trechoPost,
  weekdayCurto,
  type MemoriaBruta,
} from '../memoria-dia'

const bruta: MemoriaBruta = {
  posts: [
    {
      id: 'p1',
      conteudo: 'Na arquibancada já',
      criadoEm: '2026-08-09T18:00:00.000Z',
      imagemUrl: 'https://res.cloudinary.com/demo/foto.jpg',
      midiaUrls: [],
      autorId: 'u1',
      autorNome: 'Ana',
      autorAvatar: null,
    },
    {
      id: 'p2',
      conteudo: 'Ensaio de ontem',
      criadoEm: '2026-08-08T21:00:00.000Z',
      imagemUrl: null,
      midiaUrls: [],
      autorId: 'u2',
      autorNome: 'Beto',
      autorAvatar: null,
    },
  ],
  eventos: [
    {
      id: 'e1',
      titulo: 'Caravana SP',
      tipo: 'CARAVANA',
      data: '2026-08-09T14:00:00.000Z',
      local: 'Rodoviária',
      fotoUrl: null,
      partidaId: 'jogo-1',
    },
  ],
  partidas: [
    {
      id: 'jogo-1',
      adversario: 'Palmeiras',
      competicao: 'Brasileirão',
      dataHora: '2026-08-09T19:00:00.000Z',
      mando: 'CASA',
      status: 'ENCERRADA',
      placarCasa: 2,
      placarFora: 1,
    },
    {
      id: 'jogo-orfao',
      adversario: 'Santos',
      competicao: 'Paulista',
      dataHora: '2026-08-01T19:00:00.000Z',
      mando: 'FORA',
      status: 'ENCERRADA',
      placarCasa: 0,
      placarFora: 0,
    },
  ],
}

describe('montarMemoria', () => {
  it('agrupa post + caravana + jogo no mesmo dia SP e ignora partida órfã', () => {
    const { espinha, porDia } = montarMemoria(bruta)
    expect(espinha.map((d) => d.dia)).toEqual(['2026-08-09', '2026-08-08'])
    const diaJogo = porDia['2026-08-09']
    expect(diaJogo?.partida?.adversario).toBe('Palmeiras')
    expect(diaJogo?.eventos.map((e) => e.id)).toEqual(['e1'])
    expect(diaJogo?.posts.map((p) => p.id)).toEqual(['p1'])
    expect(diaJogo?.fotos).toEqual(['https://res.cloudinary.com/demo/foto.jpg'])
    expect(espinha[0]?.kinds).toEqual(['partida', 'evento', 'post', 'foto'])
    expect(porDia['2026-08-01']).toBeUndefined()
  })

  it('no recorte clube a partida órfã abre o dia', () => {
    const { espinha, porDia } = montarMemoria(bruta, { abrirPartidaOrfa: true })
    expect(espinha.map((d) => d.dia)).toEqual(['2026-08-09', '2026-08-08', '2026-08-01'])
    expect(porDia['2026-08-01']?.partida?.adversario).toBe('Santos')
  })

  it('fato atrasado abre o dia e entra como publicação', () => {
    const { espinha, porDia } = montarMemoria({
      posts: [],
      eventos: [],
      partidas: [],
      fatos: [
        {
          id: 'f1',
          dia: '2026-08-01T03:00:00.000Z',
          conteudo: 'Estava na arquibancada',
          midiaUrls: [],
          autorId: 'u1',
          autorNome: 'Ana',
          autorAvatar: null,
          criadoEm: '2026-08-20T18:00:00.000Z',
          postId: null,
        },
      ],
    })
    expect(espinha.map((d) => d.dia)).toEqual(['2026-08-01'])
    expect(porDia['2026-08-01']?.posts[0]?.atrasado).toBe(true)
    expect(filtrarEspinha(espinha, 'publicacao')).toHaveLength(1)
  })

  it('fato publicado no próprio dia não marca atrasado', () => {
    const { porDia } = montarMemoria({
      posts: [],
      eventos: [],
      partidas: [],
      fatos: [
        {
          id: 'f-hoje',
          dia: '2026-08-30T03:00:00.000Z',
          conteudo: 'No ensaio agora',
          midiaUrls: [],
          autorId: 'u1',
          autorNome: 'Ana',
          autorAvatar: null,
          criadoEm: '2026-08-30T18:00:00.000Z',
          postId: null,
        },
      ],
    })
    expect(porDia['2026-08-30']?.posts[0]?.atrasado).toBe(false)
  })

  it('não mistura dias vizinhos', () => {
    const { porDia } = montarMemoria(bruta)
    expect(porDia['2026-08-08']?.posts).toHaveLength(1)
    expect(porDia['2026-08-08']?.eventos).toHaveLength(0)
    expect(porDia['2026-08-08']?.partida).toBeNull()
  })

  it('atribui 02:30 UTC ao dia civil anterior em SP', () => {
    const { espinha } = montarMemoria({
      posts: [
        {
          id: 'madrugada',
          conteudo: 'Depois do jogo',
          criadoEm: '2026-08-10T02:30:00.000Z',
          imagemUrl: null,
          midiaUrls: [],
          autorId: 'u1',
          autorNome: 'Ana',
          autorAvatar: null,
        },
      ],
      eventos: [],
      partidas: [],
    })
    expect(espinha[0]?.dia).toBe('2026-08-09')
  })
})

describe('resolverDiaInicial / filtro / mês', () => {
  const { espinha } = montarMemoria(bruta)

  it('respeita ?dia= válido, senão hoje, senão o mais recente', () => {
    expect(resolverDiaInicial(espinha, '2026-08-08', '2026-08-30')).toBe('2026-08-08')
    expect(resolverDiaInicial(espinha, '1999-01-01', '2026-08-09')).toBe('2026-08-09')
    expect(resolverDiaInicial(espinha, null, '2026-12-01')).toBe('2026-08-09')
    expect(resolverDiaInicial([], '2026-08-09', '2026-08-09')).toBeNull()
  })

  it('filtra a espinha por tipo sem inventar dia', () => {
    expect(filtrarEspinha(espinha, 'jogo').map((d) => d.dia)).toEqual(['2026-08-09'])
    expect(filtrarEspinha(espinha, 'evento').map((d) => d.dia)).toEqual(['2026-08-09'])
    expect(filtrarEspinha(espinha, 'publicacao')).toHaveLength(2)
  })

  it('agrupa a espinha por mês desc', () => {
    const grupos = agruparEspinhaPorMes(espinha)
    expect(grupos).toHaveLength(1)
    expect(grupos[0]?.chave).toBe('2026-08')
    expect(grupos[0]?.dias).toHaveLength(2)
  })
})

describe('helpers', () => {
  it('valida YYYY-MM-DD real', () => {
    expect(isMemoriaDiaIso('2026-08-09')).toBe(true)
    expect(isMemoriaDiaIso('2026-13-40')).toBe(false)
    expect(isMemoriaDiaIso('09/08/2026')).toBe(false)
    expect(isMemoriaDiaIso(null)).toBe(false)
  })

  it('corta trecho e weekday curto', () => {
    expect(trechoPost('abc')).toBe('abc')
    expect(trechoPost('x'.repeat(230)).endsWith('…')).toBe(true)
    expect(weekdayCurto('2026-08-09')).toBe('dom')
  })

  it('janela cobre ~18 meses atrás e 90 dias à frente', () => {
    const { gte, lt } = janelaMemoria(new Date('2026-08-30T15:00:00.000Z'))
    expect(gte.toISOString().startsWith('2025-02-01')).toBe(true)
    expect(lt.getTime()).toBeGreaterThan(gte.getTime())
  })

  it('pagina o mês civil e lista todos os dias', () => {
    const { gte, lt } = janelaDoMes({ year: 2026, month: 8, day: 20 })
    expect(gte.toISOString()).toBe('2026-08-01T03:00:00.000Z')
    expect(lt.toISOString()).toBe('2026-09-01T03:00:00.000Z')
    const dias = diasDoMes({ year: 2026, month: 2, day: 1 })
    expect(dias).toHaveLength(28)
    expect(dias[0]).toBe('2026-02-01')
    expect(dias[27]).toBe('2026-02-28')
  })

  it('espinha do calendário inclui dia vazio para fato atrasado', () => {
    const { porDia } = montarMemoria(bruta)
    const espinha = montarEspinhaCalendario(diasDoMes({ year: 2026, month: 8, day: 1 }), porDia)
    expect(espinha).toHaveLength(31)
    expect(espinha.find((d) => d.dia === '2026-08-20')?.total).toBe(0)
    expect(espinha.find((d) => d.dia === '2026-08-09')?.kinds).toContain('partida')
  })

  it('clampa data e anda um mês sem estourar o dia', () => {
    expect(clampDiaIso('2020-01-01', '2021-08-30', '2026-11-28')).toBe('2021-08-30')
    expect(diaNoMesVizinho('2026-03-31', -1)).toBe('2026-02-28')
    const { minIso, maxIso } = limitesCalendarioMemoria('2026-08-30')
    expect(minIso).toBe('2021-08-30')
    expect(maxIso).toBe('2026-11-28')
  })

  it('janela em torno do dia deixa o selecionado no meio', () => {
    const dias = diasEmTorno('2026-08-30', '2021-08-30', '2026-11-28', 16)
    expect(dias).toHaveLength(33)
    expect(dias[16]).toBe('2026-08-30')
    expect(dias[0]).toBe('2026-08-14')
    expect(dias[32]).toBe('2026-09-15')
  })
})
