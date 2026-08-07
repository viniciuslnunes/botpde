import 'server-only'

import { cookies } from 'next/headers'
import { db } from '@torcida/db'
import { formatNomeTorcida } from '@torcida/types'
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
 * Canais visitados na barra 4+ da Comunidade (temáticos e oficiais de outras
 * unidades) — sócio, torcedor e super-admin. Cookie separado do operador
 * (`operador_canais_abertos` = slugs de troca de tenant).
 * Hierarquia fixa (torcida / unidade do vínculo) NÃO entra aqui.
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
 * Avatar efetivo do canal na barra — mesma cascata da listagem:
 * Conversa.avatarUrl → Sede.fotoUrl (unidade do canal) → Tenant.logoUrl.
 */
async function resolverAvataresBarra(
  rows: Array<{
    id: string
    tenantId: string
    avatarUrl: string | null
    canalOficial: boolean
  }>,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  if (rows.length === 0) return out

  const precisaFallback = rows.filter((r) => !r.avatarUrl)
  const sedePorCanal = new Map<string, string | null>()
  const tenantIds = [...new Set(precisaFallback.map((r) => r.tenantId))]

  if (precisaFallback.length > 0) {
    const sedes: { canalConversaId: string | null; fotoUrl: string | null }[] =
      await db.sede.findMany({
        where: {
          canalConversaId: { in: precisaFallback.map((r) => r.id) },
          fotoUrl: { not: null },
        },
        select: { canalConversaId: true, fotoUrl: true },
      })
    for (const s of sedes) {
      if (s.canalConversaId) sedePorCanal.set(s.canalConversaId, s.fotoUrl)
    }
  }

  const tenantLogo = new Map<string, string | null>()
  if (tenantIds.length > 0) {
    const tenants: { id: string; logoUrl: string | null }[] = await db.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, logoUrl: true },
    })
    for (const t of tenants) tenantLogo.set(t.id, t.logoUrl)
  }

  for (const row of rows) {
    if (row.avatarUrl) {
      out.set(row.id, row.avatarUrl)
      continue
    }
    if (!row.canalOficial) {
      out.set(row.id, null)
      continue
    }
    out.set(row.id, sedePorCanal.get(row.id) ?? tenantLogo.get(row.tenantId) ?? null)
  }
  return out
}

/**
 * Metadados dos canais visitados (temáticos e oficiais) para a barra 4+.
 * `leituraOperador`: super-admin sem vínculo — não aplica `podeVerCanal`.
 */
export async function carregarCanaisAbertosSocio(
  ids: string[],
  userId: string,
  viewerTenantId: string,
  /** Canais da hierarquia fixa (torcida/unidade) — não listar como 4+. */
  idsHierarquiaFixos: string[] = [],
  opts?: { leituraOperador?: boolean },
): Promise<CanalTematicoAberto[]> {
  if (ids.length === 0) return []

  const fixos = new Set(idsHierarquiaFixos.filter(Boolean))

  type Row = {
    id: string
    nome: string | null
    avatarUrl: string | null
    tenantId: string
    canalOficial: boolean
    visibilidadeCanal: VisibilidadeCanal
  }

  const rows: Row[] = await db.conversa.findMany({
    where: {
      id: { in: ids },
      tipo: 'CANAL',
    },
    select: {
      id: true,
      nome: true,
      avatarUrl: true,
      tenantId: true,
      canalOficial: true,
      visibilidadeCanal: true,
    },
  })

  const byId = new Map(rows.map((row) => [row.id, row]))
  const ordered: Row[] = []
  for (const id of ids) {
    if (fixos.has(id)) continue
    const row = byId.get(id)
    if (row) ordered.push(row)
  }
  if (ordered.length === 0) return []

  const leituraOperador = Boolean(opts?.leituraOperador)
  const visiveis: boolean[] = leituraOperador
    ? ordered.map(() => true)
    : await Promise.all(
        ordered.map((row) =>
          podeVerCanal(viewerTenantId, row.tenantId, row.visibilidadeCanal, userId),
        ),
      )

  const avatares = await resolverAvataresBarra(ordered)

  const out: CanalTematicoAberto[] = []
  for (let i = 0; i < ordered.length; i++) {
    if (!visiveis[i]) continue
    const row = ordered[i]!
    const nomeBruto = row.nome?.trim() || 'Canal'
    out.push({
      id: row.id,
      nome: row.canalOficial ? formatNomeTorcida(nomeBruto) : nomeBruto,
      avatarUrl: avatares.get(row.id) ?? null,
    })
  }
  return out
}

/** Confere se a conversa é um canal (temático ou oficial) elegível à barra 4+. */
export async function isCanalBarraVisitavel(canalId: string): Promise<boolean> {
  const row: { tipo: string } | null = await db.conversa.findUnique({
    where: { id: canalId },
    select: { tipo: true },
  })
  return Boolean(row && row.tipo === 'CANAL')
}

/** @deprecated Use `isCanalBarraVisitavel` — oficiais também entram na barra 4+. */
export async function isCanalTematicoAtivo(canalId: string): Promise<boolean> {
  return isCanalBarraVisitavel(canalId)
}
