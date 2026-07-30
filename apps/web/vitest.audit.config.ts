/**
 * Config separada para a auditoria funcional contra o banco real
 * (`src/**\/*.audit.ts`). Fica fora do `vitest.config.ts` de propósito: esses
 * arquivos exigem `DATABASE_URL` e dados semeados, e não devem rodar no CI
 * junto da suíte unitária.
 *
 *   pnpm --filter @torcida/web audit:dados
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
    include: ['src/**/*.audit.ts'],
    setupFiles: ['./src/test/setup-env.ts'],
    // Auditoria toca o banco remoto: sem paralelismo e com folga de tempo.
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 120_000,
  },
})
