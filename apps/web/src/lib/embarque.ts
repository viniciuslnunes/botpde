import 'server-only'
import { db } from '@torcida/db'
import type { MetodoCheckin, TrechoEmbarque } from '@torcida/db'

/**
 * Ledger de embarque — o registro de quem entrou no ônibus, por trecho.
 *
 * Convive com `EventoRsvp.checkedInAt`, que continua sendo a presença
 * materializada e é o que KPIs, CSV e Confiança leem. A divisão:
 *
 * - **IDA** materializa `checkedInAt`. É a semântica que já existia — evento
 *   `GERAL` e `ENSAIO` nunca abrem embarque, então tudo neles cai em IDA e
 *   nada muda de comportamento.
 * - **VOLTA** grava só no ledger. Sobrescrever `checkedInAt` na volta apagaria
 *   a hora em que a pessoa embarcou de fato, e quem aparece na volta sem ter
 *   ido é um buraco que o gestor precisa **ver** no painel, não algo para o
 *   sistema tapar sozinho.
 */

export type TrechoRegistro = {
  trecho: TrechoEmbarque
  materializaPresenca: boolean
}

/**
 * Em qual trecho um check-in feito agora deve cair.
 *
 * Sem embarque aberto, IDA — é o caso de todo evento que não é caravana e da
 * caravana cujo gestor prefere marcar na lista sem abrir a porta pelo painel.
 */
export function resolverTrechoParaRegistro(
  embarqueTrechoAtivo: TrechoEmbarque | null | undefined,
): TrechoRegistro {
  const trecho: TrechoEmbarque = embarqueTrechoAtivo ?? 'IDA'
  return { trecho, materializaPresenca: trecho === 'IDA' }
}

/**
 * Grava (ou reafirma) o embarque de uma pessoa num trecho.
 *
 * Idempotente por `(eventoId, userId, trecho)`: bipar a mesma carteirinha duas
 * vezes não duplica linha, só atualiza como foi registrado. Devolve se a linha
 * é nova — quem chama usa isso para não notificar de novo.
 */
export async function gravarCheckinEmbarque(input: {
  eventoId: string
  userId: string
  trecho: TrechoEmbarque
  metodo: MetodoCheckin
  registradoPorId: string | null
  override?: boolean
  lat?: number | null
  lng?: number | null
}): Promise<{ id: string; novo: boolean }> {
  const existente: { id: string } | null = await db.eventoCheckin.findUnique({
    where: {
      eventoId_userId_trecho: {
        eventoId: input.eventoId,
        userId: input.userId,
        trecho: input.trecho,
      },
    },
    select: { id: true },
  })

  const linha: { id: string } = await db.eventoCheckin.upsert({
    where: {
      eventoId_userId_trecho: {
        eventoId: input.eventoId,
        userId: input.userId,
        trecho: input.trecho,
      },
    },
    update: {
      metodo: input.metodo,
      registradoPorId: input.registradoPorId,
      override: input.override ?? false,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    },
    create: {
      eventoId: input.eventoId,
      userId: input.userId,
      trecho: input.trecho,
      metodo: input.metodo,
      registradoPorId: input.registradoPorId,
      override: input.override ?? false,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    },
    select: { id: true },
  })

  return { id: linha.id, novo: existente == null }
}

export type CheckinRegistro = {
  criadoEm: Date
  metodo: MetodoCheckin
  override: boolean
  lat: number | null
  lng: number | null
}

export type CheckinPorUsuario = Record<string, Partial<Record<TrechoEmbarque, CheckinRegistro>>>

/**
 * Todos os embarques do evento, indexados por usuário e trecho — uma query só
 * para a lista inteira, em vez de uma por linha.
 */
export async function carregarCheckinsEvento(eventoId: string): Promise<CheckinPorUsuario> {
  type Row = {
    userId: string
    trecho: TrechoEmbarque
    metodo: MetodoCheckin
    override: boolean
    criadoEm: Date
    lat: number | null
    lng: number | null
  }

  const linhas: Row[] = await db.eventoCheckin.findMany({
    where: { eventoId },
    select: {
      userId: true,
      trecho: true,
      metodo: true,
      override: true,
      criadoEm: true,
      lat: true,
      lng: true,
    },
  })

  const porUsuario: CheckinPorUsuario = {}
  for (const l of linhas) {
    const atual = porUsuario[l.userId] ?? {}
    atual[l.trecho] = {
      criadoEm: l.criadoEm,
      metodo: l.metodo,
      override: l.override,
      lat: l.lat,
      lng: l.lng,
    }
    porUsuario[l.userId] = atual
  }
  return porUsuario
}

/** Quantos embarcaram em cada trecho — o contador ao vivo do painel. */
export async function contarEmbarquePorTrecho(
  eventoId: string,
): Promise<Record<TrechoEmbarque, number>> {
  type Grupo = { trecho: TrechoEmbarque; _count: { _all: number } }
  const grupos: Grupo[] = await db.eventoCheckin.groupBy({
    by: ['trecho'],
    where: { eventoId },
    _count: { _all: true },
  })

  const contagem: Record<TrechoEmbarque, number> = { IDA: 0, VOLTA: 0 }
  for (const g of grupos) contagem[g.trecho] = g._count._all
  return contagem
}
