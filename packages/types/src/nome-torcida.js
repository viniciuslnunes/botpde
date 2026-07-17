/**
 * Nomes de torcida (própria, aliada ou coirmã) são sempre exibidos em caixa alta.
 * Use em toda projeção/UI que referencia `Tenant.nome` (ou título de catálogo equivalente).
 */
export function formatNomeTorcida(nome) {
  return String(nome ?? '')
    .trim()
    .toLocaleUpperCase('pt-BR')
}
