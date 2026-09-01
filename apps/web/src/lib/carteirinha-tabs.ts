/**
 * Abas da carteirinha no portal. Query `secao=` — o deep link de pendência
 * (`?secao=cadastro`) já estava gravado em modal, redirect e testes.
 */

export const CARTEIRINHA_PATH = '/portal/carteirinha'
export const CARTEIRINHA_SECAO_PARAM = 'secao' as const

export const CARTEIRINHA_SECOES = ['carteirinha', 'cadastro'] as const
export type CarteirinhaSecao = (typeof CARTEIRINHA_SECOES)[number]

/** `?secao=cadastro` abre a ficha; qualquer outro valor (ou ausência) é o cartão. */
export function parseCarteirinhaSecao(
  valor: string | string[] | undefined,
): CarteirinhaSecao {
  const bruto = Array.isArray(valor) ? valor[0] : valor
  return bruto === 'cadastro' ? 'cadastro' : 'carteirinha'
}

export function hrefCarteirinhaSecao(secao: CarteirinhaSecao): string {
  return secao === 'cadastro'
    ? `${CARTEIRINHA_PATH}?${CARTEIRINHA_SECAO_PARAM}=cadastro`
    : CARTEIRINHA_PATH
}
