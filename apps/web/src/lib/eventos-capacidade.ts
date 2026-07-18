/**
 * Capacidade efetiva = override do evento, senão capacidade da sede.
 * Sem nenhum dos dois → sem teto (lotação livre).
 */
export function capacidadeEfetiva(evento: {
  capacidade?: number | null
  sede?: { capacidade: number | null } | null
}): number | null {
  if (evento.capacidade != null && evento.capacidade > 0) return evento.capacidade
  const sedeCap = evento.sede?.capacidade
  if (sedeCap != null && sedeCap > 0) return sedeCap
  return null
}

export function lotacaoCheia(confirmados: number, capacidade: number | null): boolean {
  return capacidade != null && confirmados >= capacidade
}
