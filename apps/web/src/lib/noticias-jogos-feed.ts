import { cache } from 'react'
import { chaveMatch, db } from '@torcida/db'
import { apelidoClube } from '@torcida/types'
import { normalizarAdversario } from '@/lib/partidas-sync/contrato'

export type PartidaNoticiasCard = {
  id: string
  adversario: string
  competicao: string | null
  dataHora: Date
  mando: 'CASA' | 'FORA'
  status: string
  placarCasa: number | null
  placarFora: number | null
  clubeNome: string
  clubeEscudoUrl: string | null
  adversarioEscudoUrl: string | null
  estadio: string | null
  estadioEstado: string | null
}

type AfiliacaoJogoLite = {
  nome: string
  apelido: string | null
  escudoUrl: string | null
  estado: string | null
  estadio: string | null
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

const carregarIndiceAfiliacoesJogo = cache(async function carregarIndiceAfiliacoesJogo(): Promise<
  Map<string, AfiliacaoJogoLite>
> {
  const linhas: AfiliacaoJogoLite[] = await db.afiliacao.findMany({
    where: { ativo: true },
    select: {
      nome: true,
      apelido: true,
      escudoUrl: true,
      estado: true,
      estadio: true,
    },
  })

  const indice = new Map<string, AfiliacaoJogoLite>()
  for (const linha of linhas) {
    const chaves = new Set<string>([
      chaveMatch(linha.nome),
      normalizarAdversario(linha.nome),
      apelidoClube(linha.nome),
    ])
    if (linha.apelido) {
      chaves.add(chaveMatch(linha.apelido))
      chaves.add(normalizarAdversario(linha.apelido))
    }
    for (const chave of chaves) {
      if (!chave) continue
      const atual = indice.get(chave)
      if (!atual || (linha.escudoUrl && !atual.escudoUrl)) {
        indice.set(chave, linha)
      }
    }
  }
  return indice
})

export function buscarAfiliacaoPorAdversario(
  adversario: string,
  indice: Map<string, AfiliacaoJogoLite>,
): AfiliacaoJogoLite | null {
  const chaves = [
    chaveMatch(adversario),
    normalizarAdversario(adversario),
    chaveMatch(apelidoClube(adversario) || adversario),
  ]
  for (const chave of chaves) {
    if (!chave) continue
    const hit = indice.get(chave)
    if (hit) return hit
  }
  return null
}

export function montarLocalJogo(
  local: string | null,
  mando: 'CASA' | 'FORA',
  clube: AfiliacaoJogoLite,
  adversario: AfiliacaoJogoLite | null,
): { estadio: string | null; estadioEstado: string | null } {
  const mandante = mando === 'CASA' ? clube : adversario
  const estadio = local?.trim() || mandante?.estadio?.trim() || null
  const estadioEstado = mandante?.estado?.trim().toUpperCase() || null
  return { estadio, estadioEstado }
}

function mapPartida(
  row: PartidaRow,
  clube: AfiliacaoJogoLite,
  indice: Map<string, AfiliacaoJogoLite>,
): PartidaNoticiasCard {
  const adversarioAfiliacao = buscarAfiliacaoPorAdversario(row.adversario, indice)
  const { estadio, estadioEstado } = montarLocalJogo(row.local, row.mando, clube, adversarioAfiliacao)

  return {
    id: row.id,
    adversario: row.adversario,
    competicao: row.competicao,
    dataHora: row.dataHora,
    mando: row.mando,
    status: row.status,
    placarCasa: row.placarCasa,
    placarFora: row.placarFora,
    clubeNome: clube.apelido?.trim() || apelidoClube(clube.nome) || clube.nome,
    clubeEscudoUrl: clube.escudoUrl,
    adversarioEscudoUrl: adversarioAfiliacao?.escudoUrl ?? null,
    estadio,
    estadioEstado,
  }
}

/** Jogos para carrossel e sidebar do feed de notícias (afiliação do clube). */
export const carregarJogosNoticiasFeed = cache(async function carregarJogosNoticiasFeed(
  afiliacaoId: string | null,
): Promise<{ proximos: PartidaNoticiasCard[]; recentes: PartidaNoticiasCard[] }> {
  if (!afiliacaoId) return { proximos: [], recentes: [] }

  const desde = new Date()
  desde.setDate(desde.getDate() - 2)

  const ateRecentes = new Date()
  const desdeRecentes = new Date()
  desdeRecentes.setDate(desdeRecentes.getDate() - 21)

  const [clube, indice, proximos, recentes]: [
    AfiliacaoJogoLite | null,
    Map<string, AfiliacaoJogoLite>,
    PartidaRow[],
    PartidaRow[],
  ] = await Promise.all([
    db.afiliacao.findUnique({
      where: { id: afiliacaoId },
      select: {
        nome: true,
        apelido: true,
        escudoUrl: true,
        estado: true,
        estadio: true,
      },
    }),
    carregarIndiceAfiliacoesJogo(),
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

  if (!clube) return { proximos: [], recentes: [] }

  return {
    proximos: proximos.map((p) => mapPartida(p, clube, indice)),
    recentes: recentes.map((p) => mapPartida(p, clube, indice)),
  }
})
