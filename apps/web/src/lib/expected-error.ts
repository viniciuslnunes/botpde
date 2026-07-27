/**
 * Erro de validação ou regra de negócio ESPERADO e já tratado na UI
 * (toast / mensagem de form). NÃO é bug: é filtrado no `beforeSend` do Sentry
 * (ver `sentry-filter.ts`) para não virar ruído.
 *
 * Use no lugar de `throw new Error(...)` em falhas previsíveis de Server Actions
 * (Zod inválido, fluxo não permitido, estado incompatível). Nunca use para
 * falhas inesperadas — essas DEVEM chegar ao Sentry.
 */
export class ExpectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExpectedError'
  }
}

/** True para erros esperados (inclusive quando só o `name` sobrevive à serialização). */
export function isExpectedError(err: unknown): err is ExpectedError {
  return err instanceof Error && err.name === 'ExpectedError'
}
