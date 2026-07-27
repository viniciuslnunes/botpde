'use server'

import { assertMembroAtivo } from '@/lib/authz'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import {
  buildStreetViewImageUrl,
  isGoogleMapsConfigured,
  resolveCoordsFromGoogleMapsLink,
} from '@/lib/google-maps'

export type ResolverMapsLinkResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; message: string }

export type StreetViewCropResult =
  | { ok: true; dataUrl: string }
  | { ok: false; message: string }

/**
 * Expandir link do Maps é leitura (geocode) — qualquer usuário autenticado.
 * Antes exigia SEDES/EVENTS e quebrava onboarding + super-admin sem tenant.
 */
async function assertPodeResolverMapsLink(): Promise<ResolverMapsLinkResult | null> {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, message: 'Não autenticado.' }
  }
  return null
}

/** Resolve lat/lng a partir de link do Google Maps (completo ou curto). */
export async function resolverCoordsDeLinkMaps(url: string): Promise<ResolverMapsLinkResult> {
  const authErr = await assertPodeResolverMapsLink()
  if (authErr) return authErr

  const trimmed = url.trim()
  if (!trimmed) {
    return { ok: false, message: 'Cole um link do Google Maps.' }
  }
  try {
    const coords = await resolveCoordsFromGoogleMapsLink(trimmed)
    if (!coords) {
      return {
        ok: false,
        message:
          'Não foi possível ler as coordenadas deste link. Abra o local no Maps, copie o link completo (ou use Buscar no mapa).',
      }
    }
    return { ok: true, lat: coords.lat, lng: coords.lng }
  } catch {
    return {
      ok: false,
      message: 'Falha ao expandir o link do Maps. Tente o link completo ou Buscar no mapa.',
    }
  }
}

/**
 * Baixa Street View Static no servidor (evita CORS no canvas) para o editor de recorte.
 * Qualquer membro ativo do tenant — usado em sedes/eventos.
 */
export async function obterStreetViewParaCrop(input: {
  lat: number
  lng: number
  heading?: number
  pitch?: number
  fov?: number
}): Promise<StreetViewCropResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, message: 'Não autenticado.' }
  }
  const tenant = await getTenantFromHost()
  if (!tenant) {
    return { ok: false, message: 'Torcida não encontrada.' }
  }
  await assertMembroAtivo(tenant.id, session.user.id)

  if (!isGoogleMapsConfigured()) {
    return { ok: false, message: 'Chave do Google Maps não configurada.' }
  }
  if (
    !Number.isFinite(input.lat) ||
    !Number.isFinite(input.lng) ||
    Math.abs(input.lat) > 90 ||
    Math.abs(input.lng) > 180
  ) {
    return { ok: false, message: 'Coordenadas inválidas para o Street View.' }
  }

  const url = buildStreetViewImageUrl(
    { lat: input.lat, lng: input.lng },
    {
      width: 640,
      height: 360,
      heading: input.heading,
      pitch: input.pitch,
      fov: input.fov,
    },
  )
  if (!url) {
    return { ok: false, message: 'Não foi possível montar a URL do Street View.' }
  }

  try {
    const res = await fetch(url)
    if (!res.ok) {
      return { ok: false, message: 'Street View indisponível neste local.' }
    }
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      return { ok: false, message: 'Street View indisponível neste local.' }
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength < 500) {
      return { ok: false, message: 'Street View indisponível neste local.' }
    }
    return {
      ok: true,
      dataUrl: `data:${contentType};base64,${buf.toString('base64')}`,
    }
  } catch {
    return { ok: false, message: 'Falha ao baixar a imagem do Street View.' }
  }
}
