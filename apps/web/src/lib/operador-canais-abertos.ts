import 'server-only'

import { cookies } from 'next/headers'
import { db } from '@torcida/db'
import { formatNomeTorcida } from '@torcida/types'
import { isProd } from '@/lib/env'
import { sharedCookieOptions } from '@/lib/session-cookie'
import { resolveTenantLogoUrl } from '@/lib/tenant'
import { resolverTenantRaizId } from '@/lib/membros-sede'
import {
  MAX_CANAIS_OPERADOR,
  abrirCanalNaOrdem,
  reordenarCanaisOperador as aplicarOrdemCanais,
} from '@/lib/operador-canais-ordem'

/**
 * Canais que o super-admin manteve abertos na barra da Comunidade.
 * Cookie próprio (não é sessão de tenant) — sobrevive à troca de `torcida_ctx`.
 */
export const OPERADOR_CANAIS_COOKIE = 'operador_canais_abertos'

export type CanalAbertoOperador = {
  slug: string
  nome: string
  logoUrl: string | null
  /** Tenant ativo é unidade Caso B (≠ raiz da worktree). */
  ehUnidade: boolean
}

function parseSlugs(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, MAX_CANAIS_OPERADOR)
}

async function gravarSlugs(slugs: string[]): Promise<void> {
  const store = await cookies()
  if (slugs.length === 0) {
    store.delete(OPERADOR_CANAIS_COOKIE)
    return
  }
  store.set(OPERADOR_CANAIS_COOKIE, slugs.join(','), {
    ...sharedCookieOptions(isProd),
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function lerSlugsCanaisAbertosOperador(): Promise<string[]> {
  const store = await cookies()
  return parseSlugs(store.get(OPERADOR_CANAIS_COOKIE)?.value)
}

/** Abre sem reordenar (selecionar ≠ trazer para a frente). */
export async function abrirCanalOperador(slug: string): Promise<void> {
  const atuais = await lerSlugsCanaisAbertosOperador()
  const next = abrirCanalNaOrdem(atuais, slug)
  if (next.length === atuais.length && next.every((s, i) => s === atuais[i])) return
  await gravarSlugs(next)
}

export async function fecharCanalOperador(slug: string): Promise<string[]> {
  const limpo = slug.trim()
  const atuais = await lerSlugsCanaisAbertosOperador()
  const next = atuais.filter((s) => s !== limpo)
  await gravarSlugs(next)
  return next
}

/** Persiste ordem manual (drag) da barra do operador. */
export async function reordenarCanaisOperador(novaOrdem: string[]): Promise<string[] | null> {
  const atuais = await lerSlugsCanaisAbertosOperador()
  const next = aplicarOrdemCanais(atuais, novaOrdem)
  if (!next) return null
  await gravarSlugs(next)
  return next
}

/**
 * Metadados dos canais abertos (escudo + se é unidade) para a barra.
 * Ignora slugs inexistentes/inativos sem falhar.
 *
 * `excluirTenantIds`: tenants da worktree atual — unidades abertas pela
 * listagem Canais vivem no cookie de conversa (4+ com escudo real); não
 * repetir como slug (que caía no fallback "S" sem logo).
 */
export async function carregarCanaisAbertosOperador(
  slugs: string[],
  opts?: { excluirTenantIds?: string[] },
): Promise<CanalAbertoOperador[]> {
  if (slugs.length === 0) return []

  const excluir = new Set(opts?.excluirTenantIds ?? [])

  const tenants: {
    id: string
    slug: string
    nome: string
    logoUrl: string | null
  }[] = await db.tenant.findMany({
    where: { slug: { in: slugs }, ativo: true, sintetico: false },
    select: { id: true, slug: true, nome: true, logoUrl: true },
  })
  const bySlug = new Map(tenants.map((t) => [t.slug, t]))

  const out: CanalAbertoOperador[] = []
  for (const slug of slugs) {
    const t = bySlug.get(slug)
    if (!t) continue
    if (excluir.has(t.id)) continue
    const [raizId, logoUrl] = await Promise.all([
      resolverTenantRaizId(t.id),
      resolveTenantLogoUrl(t.id, t.logoUrl),
    ])
    // Preferir foto da sede/unidade se o logo do tenant estiver vazio.
    let logo = logoUrl
    if (!logo) {
      const sede: { fotoUrl: string | null } | null = await db.sede.findFirst({
        where: { tenantId: t.id, fotoUrl: { not: null } },
        orderBy: { criadoEm: 'asc' },
        select: { fotoUrl: true },
      })
      logo = sede?.fotoUrl ?? null
    }
    out.push({
      slug: t.slug,
      nome: formatNomeTorcida(t.nome),
      logoUrl: logo,
      ehUnidade: raizId !== t.id,
    })
  }
  return out
}
