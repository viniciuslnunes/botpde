/**
 * Ids das abas de Alianças + parser da query string.
 *
 * Vive fora de `alianca-forms.tsx` de propósito: aquele módulo é `'use client'`,
 * e importar uma função dele num Server Component **não** traz a função — traz
 * uma referência de client. Chamar dá "Attempted to call parseAliancaTabId()
 * from the server", que derrubava `/admin/aliancas` inteira com um erro de
 * client-side (a página respondia 200 e renderizava só a tela de erro).
 *
 * Regra geral: helper puro consumido pelos dois lados não pode morar em módulo
 * marcado `'use client'`.
 */
export type AliancaTabId =
  | 'recomendacoes'
  | 'recebidas'
  | 'enviadas'
  | 'ativas'
  | 'propor'
  | 'historico'

export const ALIANCA_TAB_IDS: readonly AliancaTabId[] = [
  'recomendacoes',
  'recebidas',
  'enviadas',
  'ativas',
  'propor',
  'historico',
]

export function parseAliancaTabId(raw: string | undefined): AliancaTabId | null {
  if (!raw) return null
  return (ALIANCA_TAB_IDS as readonly string[]).includes(raw) ? (raw as AliancaTabId) : null
}
