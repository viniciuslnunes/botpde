/** Formata contagens compactas para cards (pt-BR). */
export function formatContagem(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1_000_000) {
    const mi = n / 1_000_000
    if (Number.isInteger(mi)) {
      return `${mi.toLocaleString('pt-BR')} mi`
    }
    const arred = Math.round(mi * 10) / 10
    return `${arred.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  }
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString('pt-BR')} mil`
  if (n >= 1_000) {
    const mil = Math.round((n / 1000) * 10) / 10
    return `${mil.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  }
  return n.toLocaleString('pt-BR')
}

/** Copy quando não há dado IBOPE nem contagem na plataforma. */
export const TEXTO_ESTIMATIVA_INDISPONIVEL = 'base digital não estimada'

export const TOOLTIP_ESTIMATIVA_INDISPONIVEL =
  'Fora do Top 50 IBOPE Repucom; não há dado publicado de inscritos digitais para este clube'

export const TOOLTIP_ESTIMATIVA_PESQUISA =
  'Percentual da pesquisa Datafolha aplicado à população brasileira de 16 anos ou mais (Censo 2022, IBGE). ' +
  'Estimativa de torcedores — não confundir com seguidores de rede social.'

/** Estimativa pública por tier (pesquisa, IBOPE digital, plataforma ou indisponível). */
export function formatTorcedoresEstimados(
  n: number,
  tipo?: 'PESQUISA' | 'IBOPE_DIGITAL' | 'LIMITE_ATE' | 'PLATAFORMA' | null,
): string {
  if (tipo === 'PLATAFORMA') {
    return `${formatContagem(n)} torcedores na plataforma`
  }
  if (tipo === 'LIMITE_ATE') {
    return TEXTO_ESTIMATIVA_INDISPONIVEL
  }
  // "cerca de" e não número cheio: a pesquisa tem margem de ±2 pontos, e o
  // absoluto é uma projeção sobre a população, não uma contagem.
  if (tipo === 'PESQUISA') {
    return `cerca de ${formatContagem(n)} torcedores`
  }
  if (tipo === 'IBOPE_DIGITAL') {
    return `${formatContagem(n)} inscritos digitais`
  }
  return `~${formatContagem(n)} torcedores`
}

/** "142 · 12 online" */
export function formatTotalComOnline(total: number, online: number): string {
  if (online <= 0) return formatContagem(total)
  return `${formatContagem(total)} · ${formatContagem(online)} online`
}
