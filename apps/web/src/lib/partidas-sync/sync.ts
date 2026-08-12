import 'server-only'
import { db } from '@torcida/db'
import { env, isProvedorPartidasConfigured } from '@/lib/env'
import { COMPETICOES_BR, provedorApiFootball } from './api-football'
import {
  ehMesmoJogo,
  janelaPadrao,
  paraPartida,
  type JanelaSync,
  type PartidaExterna,
} from './contrato'

export type ResultadoSync = {
  configurado: boolean
  temporada: number
  competicoes: number
  fixtures: number
  criadas: number
  atualizadas: number
  adotadas: number
  clubes: number
}

type AfiliacaoSync = { id: string; apiExternalId: string | null }
type PartidaExistente = {
  id: string
  dataHora: Date
  adversario: string
  fonteExternalId: string | null
}

/**
 * Sincroniza `Partida` a partir do provedor externo (decisão #7).
 *
 * Só persiste fixture cujo mandante OU visitante seja um clube com
 * `Afiliacao.apiExternalId` preenchido — o resto do campeonato é descartado.
 * Um clássico entre dois clubes nossos vira duas `Partida`, uma por afiliação,
 * com mando espelhado.
 *
 * Não grava `AuditLog`: não há ator humano, e forjar um poluiria a trilha de
 * auditoria administrativa.
 */
export async function sincronizarPartidas(opcoes?: {
  janela?: JanelaSync
  temporada?: number
  /** Recorte de competições — padrão `COMPETICOES_BR`. Útil para auditar sem gastar cota. */
  competicoes?: number[]
}): Promise<ResultadoSync> {
  const temporada = opcoes?.temporada ?? env.API_FOOTBALL_SEASON ?? new Date().getFullYear()
  const janela = opcoes?.janela ?? janelaPadrao()
  const competicoes = opcoes?.competicoes ?? [...COMPETICOES_BR]

  if (!isProvedorPartidasConfigured()) {
    return {
      configurado: false,
      temporada,
      competicoes: 0,
      fixtures: 0,
      criadas: 0,
      atualizadas: 0,
      adotadas: 0,
      clubes: 0,
    }
  }

  const afiliacoes: AfiliacaoSync[] = await db.afiliacao.findMany({
    where: { ativo: true, apiExternalId: { not: null } },
    select: { id: true, apiExternalId: true },
  })

  const porExternalId = new Map<string, string>()
  for (const a of afiliacoes) {
    if (a.apiExternalId) porExternalId.set(a.apiExternalId, a.id)
  }

  if (porExternalId.size === 0) {
    return {
      configurado: true,
      temporada,
      competicoes: 0,
      fixtures: 0,
      criadas: 0,
      atualizadas: 0,
      adotadas: 0,
      clubes: 0,
    }
  }

  const externas = await provedorApiFootball.listarPartidas({
    competicoes,
    janela,
    temporada,
  })

  let criadas = 0
  let atualizadas = 0
  let adotadas = 0

  for (const externa of externas) {
    for (const externalId of [externa.timeCasaExternalId, externa.timeForaExternalId]) {
      const afiliacaoId = porExternalId.get(externalId)
      if (!afiliacaoId) continue

      const resultado = await persistir(afiliacaoId, externa, externalId)
      if (resultado === 'criada') criadas += 1
      else if (resultado === 'adotada') adotadas += 1
      else atualizadas += 1
    }
  }

  return {
    configurado: true,
    temporada,
    competicoes: competicoes.length,
    fixtures: externas.length,
    criadas,
    atualizadas,
    adotadas,
    clubes: porExternalId.size,
  }
}

/**
 * Grava uma partida do ponto de vista de um clube nosso.
 *
 * Ordem importa: antes de inserir, procura partida cadastrada à mão para o
 * mesmo jogo e **adota** (preenche `fonteExternalId`). Sem isso, todo tenant que
 * já usa a Agenda veria o jogo duplicado no primeiro sync — o registro manual
 * não tem `fonteExternalId`, e no Postgres `NULL` não colide no unique.
 */
async function persistir(
  afiliacaoId: string,
  externa: PartidaExterna,
  nossoExternalId: string,
): Promise<'criada' | 'atualizada' | 'adotada'> {
  const dados = paraPartida(externa, nossoExternalId)

  const jaSincronizada: { id: string } | null = await db.partida.findUnique({
    where: {
      afiliacaoId_fonteExternalId: {
        afiliacaoId,
        fonteExternalId: dados.fonteExternalId,
      },
    },
    select: { id: true },
  })

  if (jaSincronizada) {
    await db.partida.update({ where: { id: jaSincronizada.id }, data: dados })
    return 'atualizada'
  }

  const inicio = new Date(dados.dataHora.getTime() - 24 * 60 * 60 * 1000)
  const fim = new Date(dados.dataHora.getTime() + 24 * 60 * 60 * 1000)

  const manuais: PartidaExistente[] = await db.partida.findMany({
    where: {
      afiliacaoId,
      fonteExternalId: null,
      dataHora: { gte: inicio, lte: fim },
    },
    select: { id: true, dataHora: true, adversario: true, fonteExternalId: true },
  })

  const gemea = manuais.find((m) => ehMesmoJogo(m, dados))
  if (gemea) {
    await db.partida.update({ where: { id: gemea.id }, data: dados })
    return 'adotada'
  }

  await db.partida.create({ data: { afiliacaoId, ...dados } })
  return 'criada'
}
