/**
 * Nomes de torcida (própria, aliada ou coirmã), de afiliação (clube apoiado) e
 * de unidade (Sede/Subsede/PDE) são sempre exibidos em caixa alta.
 *
 * Use em toda projeção/UI que referencia `Tenant.nome`, `Afiliacao.nome` /
 * `Afiliacao.apelido`, `Sede.nome` (ou título de catálogo equivalente).
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
 * `Sede.nome` — Sede, Subsede ou PDE. Unidade promovida a portal já chegava em
 * caixa alta por `formatNomeTorcida` (é `Tenant.nome`) enquanto a irmã sem
 * portal vinha capitalizada do banco, então a mesma lista misturava
 * "SUBSEDE RIO CLARO" e "Subsede ABC". A caixa é de exibição: não normalize o
 * dado gravado, que é o que o presidente digitou.
 */
export function formatNomeUnidade(nome) {
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
