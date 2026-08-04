/**
 * Config dos SEEDS que precisam do código real do web (`src/**\/*.seed.ts`).
 *
 * Por que não é um script Node em `packages/db`: estes seeds não escrevem
 * linhas — eles **chamam as Server Actions de verdade** (`solicitarVinculo`,
 * `aprovarMembro`, `criarCanalTematico`…), que vivem em `apps/web`, dependem
 * do alias `@/`, de `server-only` e de `next/cache`. Semear pelo Prisma
 * produziria um banco que mente: vínculo sem canal, aprovação sem cargo,
 * canal sem AuditLog. O runner do Vitest é só o jeito mais barato de ter
 * esse ambiente.
 *
 * Diferença para `vitest.audit.config.ts`: auditoria muta e **reverte**;
 * seed **persiste** de propósito, para o produto poder ser navegado depois.
 *
 *   pnpm --filter @torcida/web seed:jornadas
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.seed.ts'],
    setupFiles: ['./src/test/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 900_000,
    hookTimeout: 300_000,
  },
})
