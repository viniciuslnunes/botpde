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

export type AliancaTabContagens = {
  recomendacoes: number
  recomendacoesVisiveis: number
  recomendacoesAlta: number
  recebidas: number
  enviadas: number
  ativas: number
  encerradas: number
}

/** Tab inicial quando a URL não traz `?tab=` — a fila acionável primeiro. */
export function resolverAliancaTabPadrao(
  readOnly: boolean,
  c: Pick<AliancaTabContagens, 'recebidas' | 'recomendacoes' | 'ativas' | 'enviadas'>,
): AliancaTabId {
  if (readOnly) return 'ativas'
  if (c.recebidas > 0) return 'recebidas'
  if (c.recomendacoes > 0) return 'recomendacoes'
  if (c.ativas > 0) return 'ativas'
  if (c.enviadas > 0) return 'enviadas'
  return 'propor'
}

export type AliancaTabItemDesc = {
  id: AliancaTabId
  label: string
  count?: number
  countClass?: string
}

const ALERTA_TAB =
  'bg-[rgb(var(--color-warning)_/_0.16)] text-[rgb(var(--color-warning-fg))]'

export function montarAliancaTabItems(
  readOnly: boolean,
  c: AliancaTabContagens,
): AliancaTabItemDesc[] {
  if (readOnly) {
    return [
      { id: 'recomendacoes', label: 'Co-irmãs', count: c.recomendacoesVisiveis },
      { id: 'ativas', label: 'Ativas', count: c.ativas },
    ]
  }
  const items: AliancaTabItemDesc[] = [
    {
      id: 'recomendacoes',
      label: 'Recomendações',
      count: c.recomendacoes,
      countClass: c.recomendacoesAlta > 0 && c.ativas === 0 ? ALERTA_TAB : undefined,
    },
    {
      id: 'recebidas',
      label: 'Recebidas',
      count: c.recebidas,
      countClass: c.recebidas > 0 ? ALERTA_TAB : undefined,
    },
    { id: 'enviadas', label: 'Enviadas', count: c.enviadas },
    { id: 'ativas', label: 'Ativas', count: c.ativas },
    { id: 'propor', label: 'Propor' },
  ]
  if (c.encerradas > 0) {
    items.push({ id: 'historico', label: 'Histórico', count: c.encerradas })
  }
  return items
}
