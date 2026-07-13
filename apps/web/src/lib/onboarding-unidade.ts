import type { SedeOnboarding } from '@/lib/onboarding'

export type SedesAgrupadasOnboarding = {
  /** Subsedes/PDEs da região + sede principal ao final */
  recomendadas: SedeOnboarding[]
  /** Demais unidades territoriais */
  outras: SedeOnboarding[]
}

export type LocalizacaoOnboarding = {
  lat: number
  lng: number
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

function distanciaKm(
  origem: LocalizacaoOnboarding,
  destino: { lat: number | null; lng: number | null },
): number | null {
  if (destino.lat == null || destino.lng == null) return null
  const raioTerraKm = 6371
  const dLat = ((destino.lat - origem.lat) * Math.PI) / 180
  const dLng = ((destino.lng - origem.lng) * Math.PI) / 180
  const lat1 = (origem.lat * Math.PI) / 180
  const lat2 = (destino.lat * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * raioTerraKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function sedeProxima(sede: SedeOnboarding, localizacao?: LocalizacaoOnboarding): boolean {
  if (!localizacao) return false
  const distancia = distanciaKm(localizacao, sede)
  return distancia != null && distancia <= 120
}

function compararPorProximidade(
  localizacao: LocalizacaoOnboarding | undefined,
): (a: SedeOnboarding, b: SedeOnboarding) => number {
  return (a, b) => {
    if (localizacao) {
      const da = distanciaKm(localizacao, a)
      const db = distanciaKm(localizacao, b)
      if (da != null && db != null && da !== db) return da - db
      if (da != null && db == null) return -1
      if (da == null && db != null) return 1
    }
    return compararSedesOnboarding(a, b)
  }
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
  localizacao?: LocalizacaoOnboarding,
): SedesAgrupadasOnboarding {
  const sedeNacional = sedes.find((s) => s.tipo === 'SEDE') ?? null
  const territoriais = sedes.filter((s) => s.tipo !== 'SEDE')
  const combina = (sede: SedeOnboarding) =>
    sedeProxima(sede, localizacao) || sedeCombinaRegiao(sede, uf, cidade)

  const regional = territoriais
    .filter(combina)
    .sort(compararPorProximidade(localizacao))
  const fora = territoriais
    .filter((s) => !combina(s))
    .sort(compararPorProximidade(localizacao))

  const recomendadas: SedeOnboarding[] = [...regional]
  if (sedeNacional) recomendadas.push(sedeNacional)

  return { recomendadas, outras: fora }
}
