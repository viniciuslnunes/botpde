/**
 * Cálculo de validade da carteirinha a partir da expedição + periodicidade.
 * Fonte da verdade operacional de vigente/inadimplente neste ciclo (não cobranças).
 */
import {
  calcularValidadeCarteirinha as calcularValidadeCarteirinhaPure,
  PERIODICIDADE_PLANO_MESES,
} from '@torcida/types'

export {
  calcularValidadeCarteirinhaPure as calcularValidadeCarteirinha,
  PERIODICIDADE_PLANO_MESES,
}

export type PeriodicidadePlano = keyof typeof PERIODICIDADE_PLANO_MESES

/** Janela «Vencendo» no admin / portal (dias). */
export const CARTEIRINHA_VENCENDO_DIAS = 30

export type StatusValidadeCarteirinha = 'ativo' | 'vencendo' | 'vencido'

/**
 * Classifica a validade em relação a `agora` (default: now).
 */
export function statusValidadeCarteirinha(
  validade: Date,
  agora: Date = new Date(),
  janelaDias: number = CARTEIRINHA_VENCENDO_DIAS,
): StatusValidadeCarteirinha {
  if (validade < agora) return 'vencido'
  const limite = new Date(agora.getTime())
  limite.setDate(limite.getDate() + janelaDias)
  if (validade < limite) return 'vencendo'
  return 'ativo'
}

export function parsePeriodicidadePlano(
  raw: string | null | undefined,
): PeriodicidadePlano | null {
  if (!raw) return null
  if (Object.prototype.hasOwnProperty.call(PERIODICIDADE_PLANO_MESES, raw)) {
    return raw as PeriodicidadePlano
  }
  return null
}
