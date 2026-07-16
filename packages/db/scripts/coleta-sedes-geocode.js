/**
 * Preenche lat/lng de sedes (endereço ou cidade+UF).
 *
 * Preferência: Google Geocoding (GOOGLE_MAPS_API_KEY / NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).
 * Fallback: Nominatim/OSM (1 req/s, sem chave) — adequado para carga inicial offline.
 *
 *   pnpm --filter @torcida/db coleta:sedes-geocode
 *   pnpm --filter @torcida/db coleta:sedes-geocode -- --dry-run
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const __dir = dirname(fileURLToPath(import.meta.url))
/** packages/db/scripts → raiz do monorepo */
const root = resolve(__dir, '../../..')

/** Carrega .env do monorepo sem sobrescrever variáveis já definidas. */
function loadEnvFiles() {
  for (const rel of ['packages/db/.env', 'apps/web/.env.local', 'apps/web/.env', '.env']) {
    const path = resolve(root, rel)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const key = t.slice(0, eq).trim()
      let val = t.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  }
}

loadEnvFiles()

const DRY_RUN = process.argv.includes('--dry-run')
const API_KEY =
  process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

const db = new PrismaClient()

function montarEndereco(sede) {
  const endereco = sede.endereco?.trim() || null
  return [endereco, sede.cidade, sede.estado, 'Brasil'].filter(Boolean).join(', ')
}

async function geocodeGoogle(endereco) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', endereco)
  url.searchParams.set('key', API_KEY)
  url.searchParams.set('region', 'br')
  url.searchParams.set('language', 'pt-BR')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`)
  const data = await res.json()
  if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'RESOURCE_EXHAUSTED') {
    throw new Error(`Geocoding quota: ${data.status}`)
  }
  const loc = data.results?.[0]?.geometry?.location
  if (!loc) return null
  return { lat: loc.lat, lng: loc.lng }
}

async function geocodeNominatim(endereco) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', endereco)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'br')

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'TorcidaSaaS-sedes-geocode/1.0 (onboarding proximity; localhost)',
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)
  const data = await res.json()
  const hit = Array.isArray(data) ? data[0] : null
  if (!hit?.lat || !hit?.lon) return null
  return { lat: Number(hit.lat), lng: Number(hit.lon) }
}

async function geocodificar(endereco, sede) {
  const tentativas = [endereco]
  // Se o endereço completo falhar, tenta só cidade+UF (ainda útil p/ proximidade).
  const cidadeUf = [sede.cidade, sede.estado, 'Brasil'].filter(Boolean).join(', ')
  if (cidadeUf && cidadeUf !== endereco && cidadeUf !== 'Brasil') {
    tentativas.push(cidadeUf)
  }

  for (let i = 0; i < tentativas.length; i += 1) {
    if (i > 0) await new Promise((r) => setTimeout(r, API_KEY ? 200 : 1100))
    const q = tentativas[i]
    const coords = API_KEY ? await geocodeGoogle(q) : await geocodeNominatim(q)
    if (coords) return coords
  }
  return null
}

async function main() {
  const provider = API_KEY ? 'Google' : 'Nominatim (OSM)'
  console.log(`Provedor: ${provider}`)

  const sedes = await db.sede.findMany({
    where: {
      ativa: true,
      OR: [{ lat: null }, { lng: null }],
      AND: [
        {
          OR: [
            { endereco: { not: null } },
            {
              AND: [{ cidade: { not: null } }, { estado: { not: null } }],
            },
          ],
        },
      ],
    },
    select: { id: true, nome: true, endereco: true, cidade: true, estado: true },
    orderBy: { nome: 'asc' },
  })

  console.log(`Geocode — ${sedes.length} sede(s) sem coordenadas${DRY_RUN ? ' (dry-run)' : ''}`)

  let ok = 0
  let skip = 0
  /** Nominatim: 1 req/s; Google: ~5/s. */
  const delayMs = API_KEY ? 200 : 1100

  for (const sede of sedes) {
    const endereco = montarEndereco(sede)
    if (!endereco || endereco === 'Brasil') {
      console.log(`⊘ Sem endereço/cidade: ${sede.nome}`)
      skip += 1
      continue
    }

    let coords
    try {
      coords = await geocodificar(endereco, sede)
    } catch (err) {
      console.error(`✗ Erro em ${sede.nome}:`, err instanceof Error ? err.message : err)
      skip += 1
      await new Promise((r) => setTimeout(r, delayMs))
      continue
    }

    if (!coords || Number.isNaN(coords.lat) || Number.isNaN(coords.lng)) {
      console.log(`⊘ Sem resultado: ${sede.nome} — ${endereco}`)
      skip += 1
      await new Promise((r) => setTimeout(r, delayMs))
      continue
    }

    if (DRY_RUN) {
      console.log(`  · ${sede.nome} → ${coords.lat}, ${coords.lng}`)
      ok += 1
      await new Promise((r) => setTimeout(r, delayMs))
      continue
    }

    await db.sede.update({
      where: { id: sede.id },
      data: { lat: coords.lat, lng: coords.lng },
    })
    console.log(`  ✓ ${sede.nome} → ${coords.lat}, ${coords.lng}`)
    ok += 1
    await new Promise((r) => setTimeout(r, delayMs))
  }

  console.log(`\nGeocode — ${ok} atualizada(s), ${skip} sem resultado${DRY_RUN ? ' (dry-run)' : ''}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
