/**
 * Resolução pura do escopo da Comunidade (sem next/headers / DB).
 * Seguro para Client Components — não importar `comunidade-contexto` no client.
 */

/** Escopo de leitura/publicação escolhido dentro da Comunidade (query `?escopo=`). */
export type EscopoComunidade = 'nacional' | 'torcida'

/**
 * Resolve o escopo efetivo a partir do parâmetro de query e do contexto do
 * usuário.
 * - Sem aba Minha torcida → sempre nacional
 * - Modo nacional (TORCEDOR) → default nacional; honra `?escopo=torcida`
 * - Modo torcida (sócio) → default torcida; honra `?escopo=nacional`
 */
export function resolverEscopoComunidadePorModo(
  modo: 'nacional' | 'torcida',
  podeEscopoTorcida: boolean,
  escopoParam: string | undefined | null,
): EscopoComunidade {
  if (!podeEscopoTorcida) return 'nacional'
  if (modo === 'nacional') {
    return escopoParam === 'torcida' ? 'torcida' : 'nacional'
  }
  return escopoParam === 'nacional' ? 'nacional' : 'torcida'
}
