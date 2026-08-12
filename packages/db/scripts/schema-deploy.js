/**
 * Pós-deploy de schema: detecta mudança em `schema.prisma` e aplica
 * `prisma db push` no alvo certo.
 *
 * O Railway **não** roda `db:push` no deploy — só `prisma generate`. Sem este
 * passo, main sobe o app e o banco (HML/prod) fica atrás → runtime quebra.
 *
 * Uso:
 *   # Só detectar (exit 1 se schema mudou desde a base)
 *   pnpm --filter @torcida/db schema:check
 *   pnpm --filter @torcida/db schema:check -- --since=origin/main
 *
 *   # CI (GitHub Actions): detecta e grava changed= em $GITHUB_OUTPUT
 *   pnpm --filter @torcida/db schema:check -- --ci-detect --since=$BEFORE
 *
 *   # Aplicar no alvo atual (DATABASE_URL do shell / .env)
 *   TORCIDA_ENV=homolog DATABASE_URL='…proxy HML…' \
 *     pnpm --filter @torcida/db schema:deploy -- --apply
 *
 *   TORCIDA_ENV=production DATABASE_URL='…proxy prod…' \
 *     pnpm --filter @torcida/db schema:deploy -- --apply --i-know-prod
 *
 *   # HML depois prod (ordem segura) — uso local; no CI são jobs separados
 *   DATABASE_URL_HML='…HML…' DATABASE_URL='…prod…' \
 *     pnpm --filter @torcida/db schema:deploy -- --apply-hml-prod --i-know-prod
 *
 * Flags:
 *   --since=<ref>     base do diff (default: origin/main se existir, senão HEAD~1).
 *                     Em CI no push pra main, passe `github.event.before` —
 *                     senão HEAD == origin/main e o diff fica vazio.
 *   --force           aplica mesmo sem diff detectado
 *   --apply           db:push no DATABASE_URL atual
 *   --apply-hml-prod  db:push em HML (DATABASE_URL_HML) e depois prod (DATABASE_URL)
 *   --i-know-prod     obrigatório para tocar produção
 *   --accept-data-loss  repassa a flag ao `prisma db push`. Necessária para
 *                     constraint nova (unique/NOT NULL/tipo mais estreito), que
 *                     o Prisma recusa por precaução mesmo sem conflito real.
 *                     Não desliga a proteção: conflito de verdade continua
 *                     falhando, agora no Postgres.
 *   --dry-run         imprime o que faria, sem push
 *   --ci-detect       só detecta; grava changed=true|false em $GITHUB_OUTPUT;
 *                     exit 0 sempre (o workflow decide o próximo job)
 *
 * Env: SCHEMA_DEPLOY_SINCE=<ref> equivale a --since=
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnvFiles } from './lib/cloudinary-admin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(DB_ROOT, '../..')
const SCHEMA_REL = 'packages/db/prisma/schema.prisma'
const ZERO_SHA = '0000000000000000000000000000000000000000'

loadEnvFiles()

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const FORCE = args.includes('--force')
const APPLY = args.includes('--apply')
const APPLY_HML_PROD = args.includes('--apply-hml-prod')
const I_KNOW_PROD = args.includes('--i-know-prod')
const CI_DETECT = args.includes('--ci-detect')
const ACCEPT_DATA_LOSS = args.includes('--accept-data-loss')
const sinceArg = args.find((a) => a.startsWith('--since='))
const SINCE_RAW = sinceArg ? sinceArg.slice('--since='.length) : process.env.SCHEMA_DEPLOY_SINCE || null
const SINCE =
  SINCE_RAW && SINCE_RAW !== ZERO_SHA && SINCE_RAW.trim() !== '' ? SINCE_RAW.trim() : null

/**
 * @param {string | undefined} url
 * @returns {'local' | 'railway-public' | 'railway-internal' | 'ausente' | 'outro'}
 */
function classificarUrl(url) {
  if (!url) return 'ausente'
  const u = url.toLowerCase()
  if (u.includes('localhost') || u.includes('127.0.0.1')) return 'local'
  if (u.includes('railway.internal')) return 'railway-internal'
  if (u.includes('proxy.rlwy.net') || u.includes('rlwy.net') || u.includes('railway.app')) {
    return 'railway-public'
  }
  return 'outro'
}

/**
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd: opts.cwd ?? REPO_ROOT,
    env: opts.env ?? process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  return r
}

function gitOk() {
  return existsSync(path.join(REPO_ROOT, '.git'))
}

/** @param {string} ref */
function refExists(ref) {
  const r = run('git', ['rev-parse', '--verify', ref])
  return r.status === 0
}

function resolverBase() {
  if (SINCE) {
    if (refExists(SINCE)) return SINCE
    // Push force / first commit: before pode não existir no clone raso.
    if (refExists('HEAD~1')) return 'HEAD~1'
  }
  if (refExists('origin/main')) return 'origin/main'
  if (refExists('main')) return 'main'
  return 'HEAD~1'
}

/**
 * @param {string} base
 * @returns {{ mudou: boolean, base: string, head: string, log: string, stat: string, pendenteLocal: boolean }}
 */
function detectarMudancaSchema(base) {
  const head = 'HEAD'
  const diff = run('git', ['diff', '--name-only', `${base}...${head}`, '--', SCHEMA_REL])
  const mudouCommit =
    diff.status === 0 && (diff.stdout || '').split(/\r?\n/).some((l) => l.trim() === SCHEMA_REL)

  // Working tree / stage: PR ainda não mergeado, ou push local pendente.
  const dirty = run('git', ['diff', '--name-only', 'HEAD', '--', SCHEMA_REL])
  const staged = run('git', ['diff', '--cached', '--name-only', '--', SCHEMA_REL])
  const pendenteLocal =
    (dirty.stdout || '').split(/\r?\n/).some((l) => l.trim() === SCHEMA_REL) ||
    (staged.stdout || '').split(/\r?\n/).some((l) => l.trim() === SCHEMA_REL)

  const mudou = FORCE || mudouCommit || pendenteLocal

  const log = run('git', [
    'log',
    '--oneline',
    `${base}...${head}`,
    '--',
    SCHEMA_REL,
  ])
  const stat = run('git', ['diff', '--stat', `${base}...${head}`, '--', SCHEMA_REL])

  return {
    mudou,
    base,
    head,
    log: (log.stdout || '').trim(),
    stat: (stat.stdout || '').trim(),
    pendenteLocal,
  }
}

/**
 * @param {{ label: string, url: string, torcidaEnv: 'local' | 'homolog' | 'production' }} alvo
 */
function aplicarPush(alvo) {
  const classe = classificarUrl(alvo.url)
  console.log(`\n→ ${alvo.label}`)
  console.log(`  TORCIDA_ENV=${alvo.torcidaEnv}`)
  console.log(`  DATABASE_URL classificado como: ${classe}`)

  if (classe === 'ausente') {
    throw new Error(`${alvo.label}: DATABASE_URL ausente.`)
  }
  if (alvo.torcidaEnv === 'local' && classe !== 'local') {
    throw new Error(
      `${alvo.label}: TORCIDA_ENV=local exige localhost/127.0.0.1 (recebeu ${classe}).`,
    )
  }
  if (alvo.torcidaEnv !== 'local' && classe === 'local') {
    throw new Error(
      `${alvo.label}: TORCIDA_ENV=${alvo.torcidaEnv} não pode apontar para localhost.`,
    )
  }
  if (classe === 'railway-internal') {
    throw new Error(
      `${alvo.label}: use DATABASE_PUBLIC_URL (*.proxy.rlwy.net) no laptop/CI — ` +
        `*.railway.internal só resolve dentro do Railway.`,
    )
  }
  if (alvo.torcidaEnv === 'production' && !I_KNOW_PROD) {
    throw new Error(
      'Produção exige --i-know-prod (checklist humano / environment protection). Ordem: HML primeiro.',
    )
  }

  if (DRY_RUN) {
    console.log('  [dry-run] prisma db push (não executado)')
    return
  }

  const env = {
    ...process.env,
    DATABASE_URL: alvo.url,
    TORCIDA_ENV: alvo.torcidaEnv,
  }
  // `--accept-data-loss` é obrigatório para constraint nova (unique, NOT NULL,
  // tipo mais estreito): o Prisma recusa por precaução, mesmo sem conflito real
  // — a mensagem é "If there are existing duplicate values, this will fail",
  // não "há duplicatas". Como este repo usa db:push (sem migrations), toda
  // constraint futura bate aqui. Se houver conflito de verdade, o Postgres
  // rejeita a criação do índice e o push falha assim mesmo: a flag remove o
  // aviso, não a proteção do banco.
  const pushArgs = ['prisma', 'db', 'push', '--skip-generate']
  if (ACCEPT_DATA_LOSS) pushArgs.push('--accept-data-loss')

  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', pushArgs, {
    cwd: DB_ROOT,
    env,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (r.status !== 0) {
    throw new Error(`${alvo.label}: prisma db push falhou (exit ${r.status}).`)
  }
  console.log(`  ✓ ${alvo.label} sincronizado`)
}

/** @param {{ mudou: boolean }} deteccao */
function escreverCiOutput(deteccao) {
  const out = process.env.GITHUB_OUTPUT
  if (!out) {
    console.log(`changed=${deteccao.mudou ? 'true' : 'false'} (GITHUB_OUTPUT ausente — só log)`)
    return
  }
  appendFileSync(out, `changed=${deteccao.mudou ? 'true' : 'false'}\n`)
}

function imprimirRunbook(deteccao) {
  console.log(`
Schema Prisma — pós-deploy (Railway NÃO aplica sozinho)
───────────────────────────────────────────────────────
Base: ${deteccao.base} → ${deteccao.head}
Mudou ${SCHEMA_REL}: ${deteccao.mudou ? 'SIM' : 'não'}${
    deteccao.pendenteLocal ? ' (inclui alteração local ainda não commitada)' : ''
  }
`)
  if (deteccao.log) {
    console.log('Commits tocando o schema:')
    console.log(deteccao.log)
    console.log('')
  }
  if (deteccao.stat) {
    console.log(deteccao.stat)
    console.log('')
  }

  if (!CI_DETECT) {
    console.log(`Ordem segura:
  1) HML
     TORCIDA_ENV=homolog DATABASE_URL='…proxy HML…' \\
       pnpm --filter @torcida/db schema:deploy -- --apply --force --accept-data-loss

  2) Validar a feature em homolog

  3) Prod (só depois) — no GitHub: environment "production" com required reviewers
     TORCIDA_ENV=production DATABASE_URL='…proxy prod…' \\
       pnpm --filter @torcida/db schema:deploy -- --apply --i-know-prod --force --accept-data-loss

  CI: .github/workflows/schema-deploy.yml
`)
  }
}

function main() {
  if (!gitOk()) {
    console.error('Repo git não encontrado na raiz do monorepo.')
    process.exit(1)
  }

  const base = resolverBase()
  const deteccao = detectarMudancaSchema(base)
  imprimirRunbook(deteccao)

  if (CI_DETECT) {
    escreverCiOutput(deteccao)
    console.log(
      deteccao.mudou
        ? 'CI: schema mudou — jobs de deploy devem rodar.'
        : 'CI: sem mudança de schema — skip deploy.',
    )
    process.exit(0)
  }

  if (!APPLY && !APPLY_HML_PROD) {
    if (deteccao.mudou) {
      console.error(
        'FAIL: schema mudou e ainda precisa de db:push em HML/prod. ' +
          'Use --apply / --apply-hml-prod (agente ops-schema) ou aguarde o workflow schema-deploy.',
      )
      process.exit(1)
    }
    console.log('OK: sem mudança de schema desde a base — nada a replicar.')
    process.exit(0)
  }

  if (!deteccao.mudou && !FORCE) {
    console.error(
      'Nenhuma mudança de schema detectada. Use --force se quiser sincronizar mesmo assim.',
    )
    process.exit(1)
  }

  if (APPLY_HML_PROD) {
    const hml = (process.env.DATABASE_URL_HML || '').trim()
    const prod = (process.env.DATABASE_URL || '').trim()
    if (!hml || !prod) {
      console.error('Defina DATABASE_URL_HML e DATABASE_URL (prod) para --apply-hml-prod.')
      process.exit(1)
    }
    if (hml === prod) {
      console.error('DATABASE_URL_HML e DATABASE_URL não podem ser iguais.')
      process.exit(1)
    }
    aplicarPush({ label: 'Homolog', url: hml, torcidaEnv: 'homolog' })
    aplicarPush({ label: 'Produção', url: prod, torcidaEnv: 'production' })
    console.log('\nPronto: HML e produção sincronizados com o schema do repo.')
    process.exit(0)
  }

  const url = (process.env.DATABASE_URL || '').trim()
  const torcidaEnv = (process.env.TORCIDA_ENV || '').trim().toLowerCase()
  if (!['local', 'homolog', 'production'].includes(torcidaEnv)) {
    console.error('Defina TORCIDA_ENV=local|homolog|production com --apply.')
    process.exit(1)
  }
  aplicarPush({
    label: torcidaEnv === 'production' ? 'Produção' : torcidaEnv === 'homolog' ? 'Homolog' : 'Local',
    url,
    torcidaEnv: /** @type {'local' | 'homolog' | 'production'} */ (torcidaEnv),
  })
  console.log('\nPronto.')
}

try {
  main()
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
