import 'server-only'

import { cache } from 'react'
import { db } from '@torcida/db'
import { avaliarElegibilidade, type BeneficioElegivel } from '@torcida/types'

/**
 * Estado da pessoa na torcida, lido de uma vez para todo mundo que a tela vai
 * mostrar. A regra de decisão é pura (`avaliarElegibilidade`); aqui só se
 * junta o que o banco já sabe: vínculo, adimplência (materializada em
 * `SaasMembro.adimplente`), carteirinha e bloqueio.
 */

export type EstadoPessoaElegibilidade = {
  membroAtivo: boolean
  desligado: boolean
  bloqueado: boolean
  adimplente: boolean
  ehSocio: boolean
  carteirinhaValida: boolean
}

const ESTADO_DESCONHECIDO: EstadoPessoaElegibilidade = {
  membroAtivo: false,
  desligado: false,
  bloqueado: false,
  adimplente: true,
  ehSocio: false,
  carteirinhaValida: true,
}

/**
 * Uma consulta por tabela, nunca uma por pessoa: estas listas aparecem em
 * escala e embarque, onde N+1 apareceria como página lenta no dia do jogo.
 */
export const carregarEstadoElegibilidade = cache(async function carregarEstadoElegibilidade(
  tenantId: string,
  userIds: readonly string[],
  opts?: { agora?: Date },
): Promise<Map<string, EstadoPessoaElegibilidade>> {
  const mapa = new Map<string, EstadoPessoaElegibilidade>()
  const ids = [...new Set(userIds)].filter(Boolean)
  if (ids.length === 0) return mapa

  const agora = opts?.agora ?? new Date()

  // Bloqueio é tabela própria (`MembroBloqueio`), distinta do desligamento
  // estatutário — a pessoa bloqueada segue membro, mas não opera.
  const [membros, socios, bloqueios]: [
    Array<{
      userId: string
      status: string
      adimplente: boolean
      desligadoEm: Date | null
    }>,
    Array<{ userId: string; validade: Date }>,
    Array<{ userId: string }>,
  ] = await Promise.all([
    db.saasMembro.findMany({
      where: { tenantId, userId: { in: ids } },
      select: {
        userId: true,
        status: true,
        adimplente: true,
        desligadoEm: true,
      },
    }),
    db.saasSocio.findMany({
      where: { tenantId, userId: { in: ids } },
      select: { userId: true, validade: true },
    }),
    db.membroBloqueio.findMany({
      where: { tenantId, userId: { in: ids } },
      select: { userId: true },
    }),
  ])

  const validadePorUser = new Map(socios.map((s) => [s.userId, s.validade]))
  const bloqueados = new Set(bloqueios.map((b) => b.userId))

  for (const id of ids) {
    const membro = membros.find((m) => m.userId === id)
    const validade = validadePorUser.get(id) ?? null
    if (!membro) {
      mapa.set(id, { ...ESTADO_DESCONHECIDO })
      continue
    }
    mapa.set(id, {
      membroAtivo: membro.status === 'APROVADO' && membro.desligadoEm == null,
      desligado: membro.desligadoEm != null,
      bloqueado: bloqueados.has(id),
      adimplente: membro.adimplente,
      ehSocio: validade != null,
      carteirinhaValida: validade == null ? true : validade.getTime() >= agora.getTime(),
    })
  }

  return mapa
})

/** Avaliação pronta por pessoa — a tela só pinta o chip. */
export async function avaliarBeneficioParaPessoas(
  tenantId: string,
  beneficio: BeneficioElegivel,
  userIds: readonly string[],
  opts?: { agora?: Date },
): Promise<Map<string, ReturnType<typeof avaliarElegibilidade>>> {
  const estados = await carregarEstadoElegibilidade(tenantId, userIds, opts)
  const saida = new Map<string, ReturnType<typeof avaliarElegibilidade>>()
  for (const [userId, estado] of estados) {
    saida.set(userId, avaliarElegibilidade(beneficio, estado))
  }
  return saida
}

/** Avaliação de uma pessoa só — usada nas Server Actions antes de gravar. */
export async function avaliarBeneficio(
  tenantId: string,
  beneficio: BeneficioElegivel,
  userId: string,
  opts?: { agora?: Date },
): Promise<ReturnType<typeof avaliarElegibilidade>> {
  const estados = await carregarEstadoElegibilidade(tenantId, [userId], opts)
  return avaliarElegibilidade(beneficio, estados.get(userId) ?? ESTADO_DESCONHECIDO)
}
