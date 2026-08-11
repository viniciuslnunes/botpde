/**
 * Habilita `pg_trgm` e cria indices GIN para a busca da Comunidade.
 *
 * Uso:
 *   pnpm --filter @torcida/db db:enable-pg-trgm
 *   pnpm --filter @torcida/db db:enable-pg-trgm -- --dry-run
 */

import { PrismaClient } from '@prisma/client'
import { prepareSeedEnv } from './lib/seed-env.js'

prepareSeedEnv({ scriptLabel: 'db:enable-pg-trgm' })

const prisma = new PrismaClient()

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')

  const statements = [
    'CREATE EXTENSION IF NOT EXISTS pg_trgm',
    'CREATE INDEX IF NOT EXISTS saas_users_nome_trgm_idx ON saas_users USING gin (lower(nome) gin_trgm_ops)',
    'CREATE INDEX IF NOT EXISTS saas_perfis_membro_bio_trgm_idx ON saas_perfis_membro USING gin (lower(bio) gin_trgm_ops)',
    'CREATE INDEX IF NOT EXISTS saas_posts_conteudo_trgm_idx ON saas_posts USING gin (lower(conteudo) gin_trgm_ops)',
    'CREATE INDEX IF NOT EXISTS saas_hashtags_tag_trgm_idx ON saas_hashtags USING gin (lower(tag) gin_trgm_ops)',
  ]

  if (dryRun) {
    console.log('Dry-run: seriam executados os seguintes statements:')
    for (const statement of statements) {
      console.log(`- ${statement}`)
    }
    return
  }

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement)
    console.log(`OK: ${statement}`)
  }

  console.log('pg_trgm habilitado e indices de busca criados com sucesso.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
