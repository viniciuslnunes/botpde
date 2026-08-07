import 'server-only'

import { cookies } from 'next/headers'
import { isProd } from '@/lib/env'
import { sharedCookieOptions } from '@/lib/session-cookie'
import { MAX_CANAIS_OPERADOR } from '@/lib/operador-canais-ordem'
import {
  reordenarBarraMovel,
  sincronizarOrdemBarraMovel,
} from '@/lib/comunidade-barra-movel'

/**
 * Ordem unificada da zona móvel (4+) — `o:slug` e `t:conversaId`.
 * Independente dos cookies de membership (`operador_canais_abertos` /
 * `socio_canais_abertos`), que só dizem o que está aberto.
 */
export const COMUNIDADE_BARRA_MOVEL_COOKIE = 'comunidade_barra_movel'

function parseChaves(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, MAX_CANAIS_OPERADOR * 2)
}

async function gravarChaves(chaves: string[]): Promise<void> {
  const store = await cookies()
  if (chaves.length === 0) {
    store.delete(COMUNIDADE_BARRA_MOVEL_COOKIE)
    return
  }
  store.set(COMUNIDADE_BARRA_MOVEL_COOKIE, chaves.join(','), {
    ...sharedCookieOptions(isProd),
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function lerOrdemBarraMovel(): Promise<string[]> {
  const store = await cookies()
  return parseChaves(store.get(COMUNIDADE_BARRA_MOVEL_COOKIE)?.value)
}

/** Ordem efetiva para a barra — cookie + conjuntos abertos. */
export async function resolverOrdemBarraMovel(opts: {
  slugsOperador: string[]
  idsTematicos: string[]
}): Promise<string[]> {
  const salva = await lerOrdemBarraMovel()
  return sincronizarOrdemBarraMovel({
    salva,
    slugsOperador: opts.slugsOperador,
    idsTematicos: opts.idsTematicos,
  })
}

export async function reordenarBarraMovelPersistir(
  novaOrdem: string[],
  opts: { slugsOperador: string[]; idsTematicos: string[] },
): Promise<string[] | null> {
  const atuais = await resolverOrdemBarraMovel(opts)
  const next = reordenarBarraMovel(atuais, novaOrdem)
  if (!next) return null
  await gravarChaves(next)
  return next
}

/** Garante que a ordem salva acompanha aberturas/fechamentos. */
export async function sincronizarBarraMovelCookie(opts: {
  slugsOperador: string[]
  idsTematicos: string[]
}): Promise<string[]> {
  const next = await resolverOrdemBarraMovel(opts)
  const salva = await lerOrdemBarraMovel()
  if (
    next.length === salva.length &&
    next.every((k, i) => k === salva[i])
  ) {
    return next
  }
  await gravarChaves(next)
  return next
}
