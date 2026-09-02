import { cache } from 'react'
import { db } from '@torcida/db'

export type PartidaNoticiasCard = {
  id: string
  adversario: string
  competicao: string | null
  dataHora: Date
  local: string | null
  mando: 'CASA' | 'FORA'
  status: string
  placarCasa: number | null
  placarFora: number | null
  clubeSigla: string
}

function siglaClube(nome: string | null | undefined): string {
  if (!nome) return 'TIM'
  const palavras = nome
    .replace(/sport club|futebol clube|esporte clube/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (palavras.length === 0) return 'TIM'
  if (palavras.length === 1) return palavras[0].slice(0, 3).toUpperCase()
  return palavras
    .slice(0, 3)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

type PartidaRow = {
  id: string
  adversario: string
  competicao: string | null
  dataHora: Date
  local: string | null
  mando: 'CASA' | 'FORA'
  status: string
  placarCasa: number | null
  placarFora: number | null
}

function mapPartida(row: PartidaRow, clubeSigla: string): PartidaNoticiasCard {
  return { ...row, clubeSigla }
}

/** Jogos para carrossel e sidebar do feed de notícias (afiliação do clube). */
export const carregarJogosNoticiasFeed = cache(async function carregarJogosNoticiasFeed(
  afiliacaoId: string | null,
  clubeNome: string | null,
): Promise<{ proximos: PartidaNoticiasCard[]; recentes: PartidaNoticiasCard[] }> {
  if (!afiliacaoId) return { proximos: [], recentes: [] }

  const clubeSigla = siglaClube(clubeNome)
  const desde = new Date()
  desde.setDate(desde.getDate() - 2)

  const ateRecentes = new Date()
  const desdeRecentes = new Date()
  desdeRecentes.setDate(desdeRecentes.getDate() - 21)

  const [proximos, recentes]: [PartidaRow[], PartidaRow[]] = await Promise.all([
    db.partida.findMany({
      where: {
        afiliacaoId,
        status: { in: ['AGENDADA', 'AO_VIVO'] },
        dataHora: { gte: desde },
      },
      select: {
        id: true,
        adversario: true,
        competicao: true,
        dataHora: true,
        local: true,
        mando: true,
        status: true,
        placarCasa: true,
        placarFora: true,
      },
      orderBy: { dataHora: 'asc' },
      take: 14,
    }),
    db.partida.findMany({
      where: {
        afiliacaoId,
        status: 'ENCERRADA',
        dataHora: { gte: desdeRecentes, lt: ateRecentes },
      },
      select: {
        id: true,
        adversario: true,
        competicao: true,
        dataHora: true,
        local: true,
        mando: true,
        status: true,
        placarCasa: true,
        placarFora: true,
      },
      orderBy: { dataHora: 'desc' },
      take: 8,
    }),
  ])

  return {
    proximos: proximos.map((p) => mapPartida(p, clubeSigla)),
    recentes: recentes.map((p) => mapPartida(p, clubeSigla)),
  }
})
