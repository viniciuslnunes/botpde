import 'server-only'

import { cookies } from 'next/headers'
import { isProd } from '@/lib/env'
import { sharedCookieOptions } from '@/lib/session-cookie'
import type { BrandEscopo } from '@/lib/comunidade-escopo'

/**
 * Marca do canal oficial em foco (Caso A sem portal próprio).
 *
 * PDE/subsede no tenant da mãe não tem cookie de tenant próprio — a sessão
 * fica na unidade anterior (ou na Sede), mas a topbar e o feed precisam
 * continuar no canal selecionado (ex.: Presidente Prudente) ao ir para
 * Canais/Agenda e voltar. Preferência de navegação; não autoriza nada.
 *
 * Retomar: `/portal/comunidade` (escopo torcida) redireciona para
 * `/portal/comunidade/canais/{canalId}` enquanto o cookie existir.
 * Limpar: Server Action (`limparMarcaCanalFoco`) ou Route Handler
 * `/portal/comunidade/limpar-canal-foco` — nunca a partir de page/layout RSC.
 * Também: abrir Sede/Caso B (`persistirMarcaCanalOficialCasoA`) ou trocar
 * de torcida.
 */
export const COMUNIDADE_CANAL_FOCO_COOKIE = 'comunidade_canal_foco'

type CanalFocoPayload = {
  canalId: string
  nome: string
  corPrimaria: string
  logoUrl: string | null
}

function parsePayload(raw: string | undefined): CanalFocoPayload | null {
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    const o = data as Record<string, unknown>
    if (typeof o.canalId !== 'string' || !o.canalId.trim()) return null
    if (typeof o.nome !== 'string' || !o.nome.trim()) return null
    if (typeof o.corPrimaria !== 'string' || !o.corPrimaria.trim()) return null
    const logoUrl =
      o.logoUrl === null || o.logoUrl === undefined
        ? null
        : typeof o.logoUrl === 'string'
          ? o.logoUrl
          : null
    return {
      canalId: o.canalId.trim(),
      nome: o.nome.trim(),
      corPrimaria: o.corPrimaria.trim(),
      logoUrl,
    }
  } catch {
    return null
  }
}

export async function lerMarcaCanalFoco(): Promise<BrandEscopo | null> {
  const store = await cookies()
  const payload = parsePayload(store.get(COMUNIDADE_CANAL_FOCO_COOKIE)?.value)
  if (!payload) return null
  return {
    nome: payload.nome,
    corPrimaria: payload.corPrimaria,
    logoUrl: payload.logoUrl,
  }
}

export async function lerCanalFocoId(): Promise<string | null> {
  const store = await cookies()
  return parsePayload(store.get(COMUNIDADE_CANAL_FOCO_COOKIE)?.value)?.canalId ?? null
}

export async function gravarMarcaCanalFoco(marca: CanalFocoPayload): Promise<void> {
  const store = await cookies()
  store.set(COMUNIDADE_CANAL_FOCO_COOKIE, JSON.stringify(marca), {
    ...sharedCookieOptions(isProd),
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function limparMarcaCanalFoco(): Promise<void> {
  const store = await cookies()
  store.delete(COMUNIDADE_CANAL_FOCO_COOKIE)
}
