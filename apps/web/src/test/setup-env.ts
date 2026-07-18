// Setup global do Vitest: pula a validação de env (env.ts) para que módulos
// cujo grafo alcança `@/lib/env` (ex.: notificacoes.ts) carreguem em testes
// unitários sem exigir DATABASE_URL/AUTH_SECRET/OAuth reais. Ver env.ts §validateEnv.
process.env.SKIP_ENV_VALIDATION = 'true'
