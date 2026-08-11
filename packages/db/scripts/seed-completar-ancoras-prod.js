/**
 * Completa âncoras de produção após expansão de TORCIDAS_BRASIL:
 * tenants → logos → departamentos/áreas → sedes → canais → sync HML (logos/tenants/coords).
 *
 *   TORCIDA_ENV=production \
 *   DATABASE_URL=…prod… DATABASE_URL_HML=…hom… \
 *   CLOUDINARY_*=…prod… \
 *   pnpm --filter @torcida/db seed:completar-ancoras-prod
 */
import { spawnSync } from 'node:child_process'
import { prepareSeedEnv } from './lib/seed-env.js'

prepareSeedEnv({ requireCloudinary: true, scriptLabel: 'completar-ancoras-prod' })

if (!(process.env.DATABASE_URL_HML || '').trim()) {
  console.error('Defina DATABASE_URL_HML (Postgres homolog, proxy público).')
  process.exit(1)
}

/** @type {Array<string | { script: string, args?: string[] }>} */
const STEPS = [
  // Roles leves em paralelo; departamentos ficam no passo seed:departamentos.
  { script: 'seed:torcidas-nacional', args: [] },
  'seed:torcidas-tenants-ancoras',
  'seed:departamentos',
  'seed:departamento-areas',
  'seed:sedes-onboarding',
  'db:ensure-canais-oficiais',
  { script: 'sync:catalogo-hml-prod', args: ['--somente-tenants'] },
  { script: 'sync:catalogo-hml-prod', args: ['--somente-logos'] },
  { script: 'sync:catalogo-hml-prod', args: ['--somente-sedes'] },
]

let i = 0
for (const step of STEPS) {
  i += 1
  const script = typeof step === 'string' ? step : step.script
  const extraArgs = typeof step === 'string' ? [] : (step.args ?? [])
  console.log(`\n=== [${i}/${STEPS.length}] ${script}${extraArgs.length ? ' ' + extraArgs.join(' ') : ''} ===\n`)
  const r = spawnSync(
    'pnpm',
    [
      '--filter',
      '@torcida/db',
      script,
      ...(extraArgs.length ? ['--', ...extraArgs] : []),
    ],
    {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        TORCIDA_ENV: 'production',
        TENANT_SLUG: '',
      },
    },
  )
  if (r.status !== 0) {
    console.error(`\nFalhou em ${script} (exit ${r.status}).`)
    process.exit(r.status ?? 1)
  }
}

console.log('\n=== seed:completar-ancoras-prod OK ===\n')
