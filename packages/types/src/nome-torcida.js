/**
 * Nomes de torcida (própria, aliada ou coirmã) e de afiliação (clube apoiado)
 * são sempre exibidos em caixa alta.
 *
 * Use em toda projeção/UI que referencia `Tenant.nome`, `Afiliacao.nome` /
 * `Afiliacao.apelido` (ou título de catálogo equivalente).
 * Não aplicar antes de matching de paleta (`paletaDoClube`) — lá o casing
 * original do banco importa.
 */

function formatNomeCaixaAlta(nome) {
  return String(nome ?? '')
    .trim()
    .toLocaleUpperCase('pt-BR')
}

/** `Tenant.nome` e títulos de catálogo de torcida. */
export function formatNomeTorcida(nome) {
  return formatNomeCaixaAlta(nome)
}

/** `Afiliacao.nome` / `Afiliacao.apelido` (clube). */
export function formatNomeAfiliacao(nome) {
  return formatNomeCaixaAlta(nome)
}

/**
 * Rótulo de exibição do clube: apelido, senão nome — sempre em caixa alta.
 * @param {{ nome?: string | null, apelido?: string | null } | null | undefined} afiliacao
 */
export function nomeExibicaoAfiliacao(afiliacao) {
  if (!afiliacao) return ''
  return formatNomeAfiliacao(afiliacao.apelido ?? afiliacao.nome)
}
