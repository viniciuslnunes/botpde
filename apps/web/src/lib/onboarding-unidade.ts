import type { SedeOnboarding } from '@/lib/onboarding'

export type SedesAgrupadasOnboarding = {
  /** Subsedes/PDEs da região + sede principal ao final */
  recomendadas: SedeOnboarding[]
  /** Demais unidades territoriais */
  outras: SedeOnboarding[]
}

function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

function pesoTipoSede(tipo: SedeOnboarding['tipo']): number {
  if (tipo === 'PONTO_ENCONTRO') return 0
  if (tipo === 'SUBSEDE') return 1
  return 2
}

export function sedeCombinaRegiao(
  sede: SedeOnboarding,
  uf?: string,
  cidade?: string,
): boolean {
  const ufNorm = uf?.trim().toUpperCase()
  const cidadeNorm = cidade?.trim()
  if (!ufNorm && !cidadeNorm) return false

  if (ufNorm && sede.estado && sede.estado.toUpperCase() !== ufNorm) return false

  if (cidadeNorm && sede.cidade) {
    const a = normalizarTexto(cidadeNorm)
    const b = normalizarTexto(sede.cidade)
    return b.includes(a) || a.includes(b)
  }

  return Boolean(ufNorm && sede.estado?.toUpperCase() === ufNorm)
}

export function compararSedesOnboarding(a: SedeOnboarding, b: SedeOnboarding): number {
  const diffTipo = pesoTipoSede(a.tipo) - pesoTipoSede(b.tipo)
  if (diffTipo !== 0) return diffTipo
  return a.nome.localeCompare(b.nome, 'pt-BR')
}

/**
 * Agrupa unidades para o passo territorial:
 * 1. Recomendadas: subsedes/PDEs da região (prioridade) + sede principal
 * 2. Outras: demais subsedes/PDEs fora da região
 */
export function agruparSedesPorRegiao(
  sedes: SedeOnboarding[],
  uf?: string,
  cidade?: string,
): SedesAgrupadasOnboarding {
  const sedeNacional = sedes.find((s) => s.tipo === 'SEDE') ?? null
  const territoriais = sedes.filter((s) => s.tipo !== 'SEDE')

  const regional = territoriais
    .filter((s) => sedeCombinaRegiao(s, uf, cidade))
    .sort(compararSedesOnboarding)
  const fora = territoriais
    .filter((s) => !sedeCombinaRegiao(s, uf, cidade))
    .sort(compararSedesOnboarding)

  const recomendadas: SedeOnboarding[] = [...regional]
  if (sedeNacional) recomendadas.push(sedeNacional)

  return { recomendadas, outras: fora }
}
