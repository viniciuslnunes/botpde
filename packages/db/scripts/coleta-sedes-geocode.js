/**
 * Preenche lat/lng de sedes com endereço via Google Geocoding API.
 *
 *   GOOGLE_MAPS_API_KEY=... pnpm --filter @torcida/db coleta:sedes-geocode
 *   pnpm --filter @torcida/db coleta:sedes-geocode -- --dry-run
 */
import { PrismaClient } from '@prisma/client'

const DRY_RUN = process.argv.includes('--dry-run')
const API_KEY =
  process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

const db = new PrismaClient()

function montarEndereco(sede) {
  return [sede.endereco, sede.cidade, sede.estado, 'Brasil'].filter(Boolean).join(', ')
}

async function geocodificar(endereco) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', endereco)
  url.searchParams.set('key', API_KEY)
  url.searchParams.set('region', 'br')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`)
  const data = await res.json()
  const loc = data.results?.[0]?.geometry?.location
  if (!loc) return null
  return { lat: loc.lat, lng: loc.lng }
}

async function main() {
  if (!API_KEY) {
    console.error('Defina GOOGLE_MAPS_API_KEY ou NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')
    process.exit(1)
  }

  const sedes = await db.sede.findMany({
    where: {
      ativa: true,
      endereco: { not: null },
      OR: [{ lat: null }, { lng: null }],
    },
    select: { id: true, nome: true, endereco: true, cidade: true, estado: true },
    orderBy: { nome: 'asc' },
  })

  let ok = 0
  let skip = 0

  for (const sede of sedes) {
    const endereco = montarEndereco(sede)
    const coords = await geocodificar(endereco)
    if (!coords) {
      console.log(`⊘ Sem resultado: ${sede.nome} — ${endereco}`)
      skip += 1
      continue
    }

    if (DRY_RUN) {
      console.log(`  · ${sede.nome} → ${coords.lat}, ${coords.lng}`)
      ok += 1
      continue
    }

    await db.sede.update({
      where: { id: sede.id },
      data: { lat: coords.lat, lng: coords.lng },
    })
    console.log(`  ✓ ${sede.nome} → ${coords.lat}, ${coords.lng}`)
    ok += 1
    await new Promise((r) => setTimeout(r, 200))
  }

  console.log(`\nGeocode — ${ok} atualizada(s), ${skip} sem resultado${DRY_RUN ? ' (dry-run)' : ''}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
