import 'server-only'

import { cookies } from 'next/headers'
import { db } from '@torcida/db'
import { isProd } from '@/lib/env'
import { sharedCookieOptions } from '@/lib/session-cookie'
import {
  MAX_CANAIS_OPERADOR,
  abrirCanalNaOrdem,
  reordenarCanaisOperador as aplicarOrdemCanais,
} from '@/lib/operador-canais-ordem'
import { podeVerCanal } from '@/lib/canais'
import type { VisibilidadeCanal } from '@/lib/canais-shared'

/**
 * Canais temáticos que o sócio manteve abertos na barra da Comunidade.
 * Cookie separado do operador (`operador_canais_abertos` = slugs de tenant).
 */
export const SOCIO_CANAIS_COOKIE = 'socio_canais_abertos'

export type CanalTematicoAberto = {
  id: string
  nome: string
  avatarUrl: string | null
}

function parseIds(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, MAX_CANAIS_OPERADOR)
}

async function gravarIds(ids: string[]): Promise<void> {
  const store = await cookies()
  if (ids.length === 0) {
    store.delete(SOCIO_CANAIS_COOKIE)
    return
  }
  store.set(SOCIO_CANAIS_COOKIE, ids.join(','), {
    ...sharedCookieOptions(isProd),
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function lerIdsCanaisAbertosSocio(): Promise<string[]> {
  const store = await cookies()
  return parseIds(store.get(SOCIO_CANAIS_COOKIE)?.value)
}

/** Abre sem reordenar (selecionar ≠ trazer para a frente). */
export async function abrirCanalSocio(canalId: string): Promise<void> {
  const atuais = await lerIdsCanaisAbertosSocio()
  const next = abrirCanalNaOrdem(atuais, canalId)
  if (next.length === atuais.length && next.every((id, i) => id === atuais[i])) return
  await gravarIds(next)
}

export async function fecharCanalSocio(canalId: string): Promise<string[]> {
  const limpo = canalId.trim()
  const atuais = await lerIdsCanaisAbertosSocio()
  const next = atuais.filter((id) => id !== limpo)
  await gravarIds(next)
  return next
}

export async function reordenarCanaisSocio(novaOrdem: string[]): Promise<string[] | null> {
  const atuais = await lerIdsCanaisAbertosSocio()
  const next = aplicarOrdemCanais(atuais, novaOrdem)
  if (!next) return null
  await gravarIds(next)
  return next
}

/**
 * Regrava o cookie só com ids ainda visíveis (ordem preservada).
 * Chamado em Server Action após registrar visita.
 */
export async function podarIdsOrfaosSocio(
  idsVisiveisOrdenados: string[],
): Promise<void> {
  const capped = idsVisiveisOrdenados.slice(0, MAX_CANAIS_OPERADOR)
  const atuais = await lerIdsCanaisAbertosSocio()
  if (
    capped.length === atuais.length &&
    capped.every((id, i) => id === atuais[i])
  ) {
    return
  }
  await gravarIds(capped)
}

/**
 * Metadados dos temáticos abertos que o viewer ainda pode ver.
 * Oficiais e ids inacessíveis são omitidos da barra (não grava cookie aqui —
 * limpeza lazy em `registrarCanalTematicoAbertoAction`).
 *
 * Uma `findMany` + checks de visibilidade em paralelo — sem N× `getCanalPorId`
 * (cada um trazia membership/sede completos desnecessários para a aba).
 */
export async function carregarCanaisAbertosSocio(
  ids: string[],
  userId: string,
  viewerTenantId: string,
): Promise<CanalTematicoAberto[]> {
  if (ids.length === 0) return []

  type Row = {
    id: string
    nome: string | null
    avatarUrl: string | null
    tenantId: string
    visibilidadeCanal: VisibilidadeCanal
  }

  const rows: Row[] = await db.conversa.findMany({
    where: {
      id: { in: ids },
      tipo: 'CANAL',
      canalOficial: false,
    },
    select: {
      id: true,
      nome: true,
      avatarUrl: true,
      tenantId: true,
      visibilidadeCanal: true,
    },
  })

  const byId = new Map(rows.map((row) => [row.id, row]))
  const ordered: Row[] = []
  for (const id of ids) {
    const row = byId.get(id)
    if (row) ordered.push(row)
  }
  if (ordered.length === 0) return []

  const visiveis: boolean[] = await Promise.all(
    ordered.map((row) =>
      podeVerCanal(viewerTenantId, row.tenantId, row.visibilidadeCanal, userId),
    ),
  )

  const out: CanalTematicoAberto[] = []
  for (let i = 0; i < ordered.length; i++) {
    if (!visiveis[i]) continue
    const row = ordered[i]!
    out.push({
      id: row.id,
      nome: row.nome?.trim() || 'Canal',
      avatarUrl: row.avatarUrl,
    })
  }
  return out
}

/** Confere se a conversa é canal temático (CANAL + não oficial) antes de abrir. */
export async function isCanalTematicoAtivo(canalId: string): Promise<boolean> {
  const row: { tipo: string; canalOficial: boolean } | null = await db.conversa.findUnique({
    where: { id: canalId },
    select: { tipo: true, canalOficial: true },
  })
  return Boolean(row && row.tipo === 'CANAL' && !row.canalOficial)
}
