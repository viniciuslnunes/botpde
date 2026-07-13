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

/** Estimativa pública de torcedores (web). */
export function formatTorcedoresEstimados(n: number): string {
  return `~${formatContagem(n)} torcedores`
}

/** "142 · 12 online" */
export function formatTotalComOnline(total: number, online: number): string {
  if (online <= 0) return formatContagem(total)
  return `${formatContagem(total)} · ${formatContagem(online)} online`
}
