import { maskTelefone } from '@torcida/types'

/**
 * Telefone BR mascarado para as listagens de sócios/torcedores.
 * Não altera o valor gravado — a busca por dígitos continua no bruto.
 */
export function formatTelefoneListagem(raw: string | null | undefined): string | null {
  const masked = maskTelefone(raw)
  return masked || null
}

/**
 * Área, unidade, origem e cidade nas colunas da listagem — caixa alta de
 * exibição (`pt-BR`). O dado no banco permanece como foi digitado.
 */
export function formatCaixaAltaListagem(raw: string | null | undefined): string | null {
  const t = raw?.trim()
  return t ? t.toLocaleUpperCase('pt-BR') : null
}
