/**
 * Catálogo de produção (clubes, escudos, torcidas vazias, mapas…) — sem users/teste.
 *
 *   TORCIDA_ENV=production \
 *   DATABASE_URL='…DATABASE_PUBLIC_URL…' \
 *   CLOUDINARY_CLOUD_NAME=… CLOUDINARY_API_KEY=… CLOUDINARY_API_SECRET=… \
 *   pnpm --filter @torcida/db seed:catalogo-producao
 *
 * Opcional: THESPORTSDB_KEY, GOOGLE_MAPS_API_KEY
 */
import { spawnSync } from 'node:child_process'
import { prepareSeedEnv } from './lib/seed-env.js'

prepareSeedEnv({ requireCloudinary: true, scriptLabel: 'catalogo-producao' })

const STEPS = [
  'db:enable-pg-trgm',
  'seed:afiliacoes',
  'seed:escudos-ogol',
  'seed:escudos-soccerwiki',
  'db:repair-series-afiliacoes',
  'seed:torcedores-estimados',
  // Torcidas antes das recomendações (precisa de Tenant no banco).
  'seed:torcidas-nacional',
  'seed:torcidas-conhecidas',
  // Linka logo das 32 âncoras (TorcidaConhecida → Tenant); não cria 546 tenants.
  'seed:torcidas-tenants-ancoras',
  'seed:recomendacoes-aliancas',
  'seed:departamentos',
  'seed:departamento-areas',
  'seed:sedes-onboarding',
  'coleta:sedes-geocode',
  'db:ensure-canais-oficiais',
]

let i = 0
for (const script of STEPS) {
  i += 1
  console.log(`\n=== [${i}/${STEPS.length}] ${script} ===\n`)
  const r = spawnSync(
    'pnpm',
    ['--filter', '@torcida/db', script],
    {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        TORCIDA_ENV: 'production',
        // Catálogo cobre todos os tenants; não herdar TENANT_SLUG do .env.local.
        TENANT_SLUG: '',
      },
    },
  )
  if (r.status !== 0) {
    console.error(`\nFalhou em ${script} (exit ${r.status}).`)
    process.exit(r.status ?? 1)
  }
}

console.log('\n=== seed:catalogo-producao OK ===\n')
