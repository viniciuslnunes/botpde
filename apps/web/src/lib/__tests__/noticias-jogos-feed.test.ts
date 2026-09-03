import { describe, expect, it } from 'vitest'
import {
  buscarAfiliacaoPorAdversario,
  montarLocalJogo,
  type PartidaNoticiasCard,
} from '@/lib/noticias-jogos-feed'

describe('buscarAfiliacaoPorAdversario', () => {
  const indice = new Map([
    [
      'santos',
      {
        nome: 'Santos Futebol Clube',
        apelido: 'Santos',
        escudoUrl: 'https://cdn.example/santos.png',
        estado: 'SP',
        estadio: 'Vila Belmiro',
      },
    ],
    [
      'palmeiras',
      {
        nome: 'Sociedade Esportiva Palmeiras',
        apelido: 'Palmeiras',
        escudoUrl: 'https://cdn.example/palmeiras.png',
        estado: 'SP',
        estadio: 'Allianz Parque',
      },
    ],
  ])

  it('resolve adversário pelo nome curto da API', () => {
    const hit = buscarAfiliacaoPorAdversario('Santos', indice)
    expect(hit?.escudoUrl).toBe('https://cdn.example/santos.png')
  })

  it('resolve adversário com ruído de pontuação', () => {
    const hit = buscarAfiliacaoPorAdversario('Palmeiras-SP', indice)
    expect(hit?.apelido).toBe('Palmeiras')
  })
})

describe('montarLocalJogo', () => {
  const corinthians = {
    nome: 'Sport Club Corinthians Paulista',
    apelido: 'Corinthians',
    escudoUrl: 'https://cdn.example/cor.png',
    estado: 'SP',
    estadio: 'Neo Química Arena',
  }
  const santos = {
    nome: 'Santos Futebol Clube',
    apelido: 'Santos',
    escudoUrl: 'https://cdn.example/santos.png',
    estado: 'SP',
    estadio: 'Vila Belmiro',
  }

  it('prioriza o local gravado na partida', () => {
    expect(montarLocalJogo('Morumbi', 'FORA', corinthians, santos)).toEqual({
      estadio: 'Morumbi',
      estadioEstado: 'SP',
    })
  })

  it('cai no estádio do mandante quando a partida não tem local', () => {
    expect(montarLocalJogo(null, 'CASA', corinthians, santos)).toEqual({
      estadio: 'Neo Química Arena',
      estadioEstado: 'SP',
    })
  })
})

describe('PartidaNoticiasCard', () => {
  it('expõe escudos e local para o carrossel', () => {
    const card: PartidaNoticiasCard = {
      id: '1',
      adversario: 'Santos',
      competicao: 'Paulistão',
      dataHora: new Date('2026-09-03T21:00:00Z'),
      mando: 'CASA',
      status: 'AGENDADA',
      placarCasa: null,
      placarFora: null,
      clubeNome: 'Corinthians',
      clubeEscudoUrl: 'https://cdn.example/cor.png',
      adversarioEscudoUrl: 'https://cdn.example/santos.png',
      estadio: 'Neo Química Arena',
      estadioEstado: 'SP',
    }
    expect(card.adversarioEscudoUrl).toContain('santos')
    expect(card.estadioEstado).toBe('SP')
  })
})
